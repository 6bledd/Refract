#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;
use serde::Serialize;
use serde_json::Value;
use std::path::{Path, PathBuf};
use std::sync::{Mutex, OnceLock};
use tauri::{AppHandle, Manager};
use tokio::process::Command;

fn python_command() -> Command {
    let mut command = Command::new("python");
    #[cfg(target_os = "windows")]
    command.creation_flags(0x08000000); // CREATE_NO_WINDOW
    command
}

#[derive(Serialize)]
struct SpotifyTrack {
    title: String,
    artists: String,
    spotify_url: String,
    artwork_url: Option<String>,
}

#[derive(Serialize)]
struct StreamingSearchTrack {
    title: String,
    artists: String,
    provider: String,
    source_url: String,
    spotify_url: Option<String>,
    artwork_url: Option<String>,
    duration: Option<f64>,
}

#[derive(Serialize)]
struct DownloadedTrack {
    path: String,
    title: String,
    artist: String,
    duration: Option<f64>,
    artwork_data_url: Option<String>,
}

#[derive(Serialize)]
struct BackgroundVideo {
    name: String,
    path: String,
}

fn safe_background_video_name(file_name: &str) -> Result<String, String> {
    if file_name.contains('/') || file_name.contains('\\') { return Err("Invalid video file name.".into()); }
    let path = Path::new(file_name);
    let extension = path.extension().and_then(|extension| extension.to_str())
        .map(str::to_ascii_lowercase)
        .filter(|extension| matches!(extension.as_str(), "mp4" | "webm" | "mov" | "m4v"))
        .ok_or_else(|| "Choose an MP4, WebM, MOV, or M4V video.".to_string())?;
    let stem = path.file_stem().and_then(|stem| stem.to_str()).unwrap_or("background")
        .chars().map(|character| if character.is_ascii_alphanumeric() || matches!(character, '-' | '_' | ' ') { character } else { '_' })
        .collect::<String>().trim().to_string();
    let stem = if stem.is_empty() { "background" } else { &stem };
    Ok(format!("{stem}.{extension}"))
}

fn background_video_dir(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(app.path().app_data_dir()
        .map_err(|error| format!("Could not locate the app data folder: {error}"))?
        .join("background-videos"))
}

#[tauri::command]
async fn write_background_video_chunk(
    app: AppHandle,
    file_name: String,
    chunk_index: usize,
    is_last: bool,
    bytes: Vec<u8>,
) -> Result<String, String> {
    use tokio::io::AsyncWriteExt;
    let safe_name = safe_background_video_name(&file_name)?;
    let directory = background_video_dir(&app)?;
    tokio::fs::create_dir_all(&directory).await
        .map_err(|error| format!("Could not create the video storage folder: {error}"))?;
    let path = directory.join(format!("{safe_name}.uploading"));
    let mut options = tokio::fs::OpenOptions::new();
    options.create(true).write(true);
    if chunk_index == 0 {
        options.truncate(true);
    } else {
        options.append(true);
    }
    let mut file = options.open(&path).await
        .map_err(|error| format!("Could not save the video: {error}"))?;
    file.write_all(&bytes).await
        .map_err(|error| format!("Could not finish saving the video: {error}"))?;
    file.flush().await.map_err(|error| format!("Could not finish saving the video: {error}"))?;
    drop(file);
    if is_last {
        let final_path = directory.join(&safe_name);
        if tokio::fs::try_exists(&final_path).await.unwrap_or(false) {
            tokio::fs::remove_file(&final_path).await.map_err(|error| format!("Could not replace the saved video: {error}"))?;
        }
        tokio::fs::rename(&path, final_path).await.map_err(|error| format!("Could not finish saving the video: {error}"))?;
    }
    Ok(safe_name)
}

#[tauri::command]
fn list_background_videos(app: AppHandle) -> Result<Vec<BackgroundVideo>, String> {
    let directory = background_video_dir(&app)?;
    std::fs::create_dir_all(&directory)
        .map_err(|error| format!("Could not create the video storage folder: {error}"))?;
    let mut videos = std::fs::read_dir(&directory)
        .map_err(|error| format!("Could not read saved videos: {error}"))?
        .filter_map(Result::ok)
        .map(|entry| entry.path())
        .filter(|path| path.is_file() && matches!(path.extension().and_then(|value| value.to_str()).map(str::to_ascii_lowercase).as_deref(), Some("mp4" | "webm" | "mov" | "m4v")))
        .map(|path| BackgroundVideo {
            name: path.file_name().and_then(|name| name.to_str()).unwrap_or("Video").to_string(),
            path: path.to_string_lossy().into_owned(),
        })
        .collect::<Vec<_>>();
    videos.sort_by(|left, right| left.name.to_lowercase().cmp(&right.name.to_lowercase()));
    Ok(videos)
}

fn value_string(value: &Value, keys: &[&str]) -> Option<String> {
    keys.iter().find_map(|key| value.get(*key).and_then(Value::as_str).map(str::to_owned))
}

fn parse_track(value: &Value) -> Option<SpotifyTrack> {
    let title = value_string(value, &["name", "title"])?;
    let artists = value.get("artists").and_then(Value::as_array)
        .map(|items| items.iter().filter_map(|artist| {
            artist.as_str().map(str::to_owned)
                .or_else(|| artist.get("name").and_then(Value::as_str).map(str::to_owned))
        }).collect::<Vec<_>>().join(", "))
        .filter(|artists| !artists.is_empty())
        .or_else(|| value_string(value, &["artist", "artists_string"]))
        .unwrap_or_default();
    let id = value_string(value, &["song_id", "spotify_id", "id"]);
    let spotify_url = value_string(value, &["url", "spotify_url"])
        .or_else(|| id.map(|id| format!("https://open.spotify.com/track/{id}")))
        .unwrap_or_default();
    Some(SpotifyTrack {
        title,
        artists,
        spotify_url,
        artwork_url: value_string(value, &["cover_url", "artwork_url", "thumbnail_url"]),
    })
}

async fn search_ytdlp_provider(query: &str, provider: &str) -> Result<Vec<StreamingSearchTrack>, String> {
    let prefix = if provider == "soundcloud" { "scsearch6:" } else { "ytsearch6:" };
    let search_term = format!("{prefix}{query}");
    let mut cmd = python_command();
    cmd.args(["-m", "yt_dlp", "--flat-playlist", "--dump-single-json", "--no-warnings", "--skip-download"])
        .arg(&search_term)
        .kill_on_drop(true);

    let output = match tokio::time::timeout(
        std::time::Duration::from_secs(35),
        cmd.output(),
    ).await {
        Ok(res) => res.map_err(|error| format!("Could not start Python for streaming search: {error}"))?,
        Err(_) => return Err(format!("{} search timed out.", if provider == "soundCloud" { "SoundCloud" } else { "YouTube" })),
    };
    if !output.status.success() {
        let error = String::from_utf8_lossy(&output.stderr).trim().to_string();
        return Err(if error.is_empty() { format!("{} search failed.", provider) } else { error });
    }
    let data: Value = serde_json::from_slice(&output.stdout)
        .map_err(|_| format!("{} returned search results in an unexpected format.", provider))?;
    let entries = data.get("entries").and_then(Value::as_array)
        .cloned().unwrap_or_else(|| vec![data]);
    Ok(entries.iter().filter_map(|entry| {
        let title = value_string(entry, &["title"])?;
        let artists = value_string(entry, &["artist", "uploader", "channel", "creator", "uploader_id"])
            .unwrap_or_default();
        let id = value_string(entry, &["id"]);
        let mut source_url = value_string(entry, &["webpage_url", "original_url"])
            .or_else(|| value_string(entry, &["url"]).filter(|url| url.starts_with("http")))
            .unwrap_or_default();
        if provider == "youtube" && !source_url.starts_with("http") {
            if let Some(id) = id { source_url = format!("https://www.youtube.com/watch?v={id}"); }
        }
        if source_url.is_empty() { return None; }
        let artwork_url = value_string(entry, &["thumbnail", "thumbnail_url"])
            .or_else(|| entry.get("thumbnails").and_then(Value::as_array).and_then(|items| items.last())
                .and_then(|item| value_string(item, &["url"])));
        Some(StreamingSearchTrack {
            title,
            artists,
            provider: provider.to_string(),
            source_url,
            spotify_url: None,
            artwork_url,
            duration: entry.get("duration").and_then(Value::as_f64),
        })
    }).collect())
}

async fn search_spotify_catalog(query: &str) -> Result<Vec<StreamingSearchTrack>, String> {
    let output = tokio::time::timeout(
        std::time::Duration::from_secs(35),
        python_command()
            .args(["-m", "spotdl", "save", query, "--save-file", "-", "--log-level", "ERROR"])
            .kill_on_drop(true)
            .output(),
    )
    .await
    .map_err(|_| "Spotify search timed out.".to_string())?
    .map_err(|error| format!("Could not start Python for Spotify search: {error}"))?;
    if !output.status.success() {
        let error = String::from_utf8_lossy(&output.stderr).trim().to_string();
        return Err(if error.is_empty() { "Spotify search failed.".into() } else { error });
    }
    let data: Value = serde_json::from_slice(&output.stdout)
        .map_err(|_| "Spotify returned search results in an unexpected format.".to_string())?;
    let entries = data.as_array().cloned().unwrap_or_else(|| {
        data.get("songs").and_then(Value::as_array).cloned().unwrap_or_else(|| vec![data])
    });
    Ok(entries.iter().filter_map(parse_track).map(|track| StreamingSearchTrack {
        title: track.title,
        artists: track.artists,
        provider: "spotify".to_string(),
        source_url: String::new(),
        spotify_url: Some(track.spotify_url),
        artwork_url: track.artwork_url,
        duration: None,
    }).collect())
}

#[tauri::command]
async fn search_streaming_services(query: String) -> Result<Vec<StreamingSearchTrack>, String> {
    let query = query.trim();
    if query.chars().count() < 2 { return Ok(Vec::new()); }
    if query.chars().count() > 160 { return Err("Search terms must be 160 characters or fewer.".into()); }
    let (spotify, youtube, soundcloud) = tokio::join!(
        search_spotify_catalog(query),
        search_ytdlp_provider(query, "youtube"),
        search_ytdlp_provider(query, "soundcloud"),
    );
    let mut results = Vec::new();
    let mut failures = Vec::new();
    match spotify { Ok(items) => results.extend(items), Err(error) => failures.push(error) }
    match youtube { Ok(items) => results.extend(items), Err(error) => failures.push(error) }
    match soundcloud { Ok(items) => results.extend(items), Err(error) => failures.push(error) }
    if results.is_empty() && !failures.is_empty() { return Err(failures.join("\n")); }
    Ok(results)
}

#[tauri::command]
async fn inspect_spotify_link(url: String) -> Result<Vec<SpotifyTrack>, String> {
    if !(url.starts_with("https://open.spotify.com/") || url.starts_with("https://spotify.link/")) {
        return Err("Paste a Spotify track, album, or playlist link.".into());
    }

    let metadata_script = r#"import json, re, sys
from argparse import Namespace
from urllib.parse import urlsplit
import requests
from spotdl.types.playlist import Playlist
from spotdl.utils.config import create_settings
from spotdl.utils.search import get_simple_songs
from spotdl.utils.spotify import SpotifyClient

url = sys.argv[1]
if urlsplit(url).hostname == "spotify.link":
    url = requests.head(url, allow_redirects=True, timeout=10).url
if urlsplit(url).hostname != "open.spotify.com":
    raise ValueError("The link did not resolve to Spotify.")
url = re.sub(r"/intl-\w+/", "/", url, count=1)

spotify_settings, _, _ = create_settings(Namespace(config=False))
SpotifyClient.init(**spotify_settings)
if "playlist" in urlsplit(url).path.split("/"):
    _, songs = Playlist.get_metadata(url)
else:
    songs = get_simple_songs([url])
print(json.dumps([song.json for song in songs]))"#;
    let output = tokio::time::timeout(
        std::time::Duration::from_secs(180),
        python_command()
            .args(["-c", metadata_script, &url])
            .kill_on_drop(true)
            .output(),
    )
    .await
    .map_err(|_| "Fetching Spotify metadata timed out after 3 minutes.".to_string())?
    .map_err(|_| "Python was not found. Install Python and spotDL with `python -m pip install spotdl`, then try again.".to_string())?;
    if !output.status.success() {
        let details = String::from_utf8_lossy(&output.stderr).trim().to_string();
        return Err(if details.is_empty() { "spotDL could not read that Spotify link.".into() } else { details });
    }

    let data: Value = serde_json::from_slice(&output.stdout)
        .map_err(|_| "spotDL returned metadata in an unexpected format.".to_string())?;
    let items = data.as_array().cloned().unwrap_or_else(|| {
        data.get("songs").and_then(Value::as_array).cloned().unwrap_or_else(|| vec![data])
    });
    let tracks = items.iter().filter_map(parse_track).collect::<Vec<_>>();
    if tracks.is_empty() { return Err("No tracks were found for that Spotify link.".into()); }
    Ok(tracks)
}

fn find_downloaded_audio(directory: &Path, format: &str) -> Option<PathBuf> {
    std::fs::read_dir(directory).ok()?
        .filter_map(Result::ok)
        .map(|entry| entry.path())
        .filter(|path| {
            path.is_file() && path.extension().and_then(|ext| ext.to_str())
                .is_some_and(|ext| ext.eq_ignore_ascii_case(format))
        })
        .max_by_key(|path| std::fs::metadata(path).and_then(|meta| meta.modified()).ok())
}

fn fallback_downloaded_track(path: &Path) -> DownloadedTrack {
    let name = path.file_stem().and_then(|value| value.to_str()).unwrap_or("Unknown track");
    let (artist, title) = name.split_once(" - ").unwrap_or(("", name));
    DownloadedTrack {
        path: path.to_string_lossy().into_owned(),
        title: title.to_string(),
        artist: artist.to_string(),
        duration: None,
        artwork_data_url: None,
    }
}

#[tauri::command]
async fn list_downloaded_tracks(app: AppHandle) -> Result<Vec<DownloadedTrack>, String> {
    let downloads_dir = app.path().app_data_dir()
        .map_err(|error| format!("Could not locate the app data folder: {error}"))?
        .join("downloads");
    std::fs::create_dir_all(&downloads_dir)
        .map_err(|error| format!("Could not create the downloads folder: {error}"))?;
    let mut paths = std::fs::read_dir(&downloads_dir)
        .map_err(|error| format!("Could not read the downloads folder: {error}"))?
        .filter_map(Result::ok)
        .map(|entry| entry.path())
        .filter(|path| {
            path.is_file()
                && matches!(path.extension().and_then(|ext| ext.to_str()).map(str::to_ascii_lowercase).as_deref(), Some("mp3" | "m4a"))
        })
        .collect::<Vec<_>>();
    paths.sort();
    if paths.is_empty() {
        return Ok(Vec::new());
    }

    let metadata_script = r#"import base64, json, sys
from mutagen import File
items = []
name_tag = chr(0xa9) + "nam"
artist_tag = chr(0xa9) + "ART"
for p in sys.argv[1:]:
    result = {"path": p, "title": "", "artist": "", "duration": None, "artwork_data_url": None}
    try:
        audio = File(p)
        if audio is not None:
            tags = audio.tags or {}
            def first(keys):
                for key in keys:
                    value = tags.get(key)
                    if value is not None:
                        if isinstance(value, (list, tuple)):
                            value = value[0] if value else ""
                        return str(value)
                return ""
            result["title"] = first(["TIT2", "title", name_tag])
            result["artist"] = first(["TPE1", "artist", artist_tag])
            result["duration"] = getattr(getattr(audio, "info", None), "length", None)
            pictures = getattr(audio, "pictures", [])
            image = pictures[0].data if pictures else None
            mime = "image/jpeg"
            if image is None:
                for value in tags.values():
                    if value.__class__.__name__ == "APIC":
                        image = value.data
                        mime = getattr(value, "mime", "image/jpeg")
                        break
                    if isinstance(value, list) and value and value[0].__class__.__name__ == "MP4Cover":
                        image = bytes(value[0])
                        mime = "image/png" if getattr(value[0], "imageformat", 0) == 14 else "image/jpeg"
                        break
            if image:
                result["artwork_data_url"] = "data:" + mime + ";base64," + base64.b64encode(image).decode("ascii")
    except Exception:
        pass
    items.append(result)
print(json.dumps(items))"#;
    let mut tracks = Vec::with_capacity(paths.len());
    // Keep each command line within Windows' argument length limit.
    for batch in paths.chunks(16) {
        let output = python_command()
            .args(["-c", metadata_script])
            .args(batch)
            .output()
            .await;
        let metadata = output.ok()
            .filter(|output| output.status.success())
            .and_then(|output| serde_json::from_slice::<Vec<Value>>(&output.stdout).ok());
        tracks.extend(batch.iter().enumerate().map(|(index, path)| {
            let fallback = fallback_downloaded_track(path);
            let Some(value) = metadata.as_ref().and_then(|items| items.get(index)) else { return fallback; };
            DownloadedTrack {
                path: path.to_string_lossy().into_owned(),
                title: value_string(value, &["title"]).filter(|value| !value.trim().is_empty()).unwrap_or(fallback.title),
                artist: value_string(value, &["artist"]).filter(|value| !value.trim().is_empty()).unwrap_or(fallback.artist),
                duration: value.get("duration").and_then(Value::as_f64),
                artwork_data_url: value_string(value, &["artwork_data_url"]),
            }
        }));
    }
    Ok(tracks)
}

#[tauri::command]
fn clear_downloaded_tracks(app: AppHandle) -> Result<usize, String> {
    let downloads_dir = app.path().app_data_dir()
        .map_err(|error| format!("Could not locate the app data folder: {error}"))?
        .join("downloads");
    std::fs::create_dir_all(&downloads_dir)
        .map_err(|error| format!("Could not create the downloads folder: {error}"))?;
    let paths = std::fs::read_dir(&downloads_dir)
        .map_err(|error| format!("Could not read the downloads folder: {error}"))?
        .filter_map(Result::ok)
        .map(|entry| entry.path())
        .filter(|path| {
            path.is_file()
                && matches!(path.extension().and_then(|ext| ext.to_str()).map(str::to_ascii_lowercase).as_deref(), Some("mp3" | "m4a"))
        })
        .collect::<Vec<_>>();
    let mut removed = 0;
    for path in paths {
        std::fs::remove_file(&path)
            .map_err(|error| format!("Could not remove {}: {error}", path.display()))?;
        removed += 1;
    }
    Ok(removed)
}

#[tauri::command]
async fn download_spotify_track(
    app: AppHandle,
    query: String,
    provider: String,
    spotify_url: Option<String>,
    source_url: Option<String>,
    audio_format: String,
) -> Result<DownloadedTrack, String> {
    let downloads_dir = app.path().app_data_dir()
        .map_err(|error| format!("Could not locate the app data folder: {error}"))?
        .join("downloads");
    std::fs::create_dir_all(&downloads_dir)
        .map_err(|error| format!("Could not create the downloads folder: {error}"))?;
    let staging = tempfile::tempdir_in(&downloads_dir)
        .map_err(|error| format!("Could not create a temporary download folder: {error}"))?;
    let (mut track, path) = tokio::time::timeout(
        std::time::Duration::from_secs(120),
        download_track_to_directory(staging.path(), query, provider, spotify_url, source_url, audio_format),
    )
    .await
    .map_err(|_| "Track download timed out after 2 minutes.".to_string())??;
    static SAVE_DOWNLOAD: Mutex<()> = Mutex::new(());
    let _save = SAVE_DOWNLOAD.lock().map_err(|error| error.to_string())?;
    let file_name = path.file_name().ok_or("Downloaded audio has no file name.")?;
    let mut destination = downloads_dir.join(file_name);
    for suffix in 2.. {
        if !destination.exists() { break; }
        let stem = path.file_stem().unwrap_or_default().to_string_lossy();
        let extension = path.extension().unwrap_or_default().to_string_lossy();
        destination = downloads_dir.join(format!("{stem} ({suffix}).{extension}"));
    }
    std::fs::rename(&path, &destination)
        .map_err(|error| format!("Could not save downloaded audio: {error}"))?;
    track.path = destination.to_string_lossy().into_owned();
    Ok(track)
}

async fn download_track_to_directory(
    directory: &Path,
    query: String,
    provider: String,
    spotify_url: Option<String>,
    source_url: Option<String>,
    audio_format: String,
) -> Result<(DownloadedTrack, PathBuf), String> {
    let audio_provider = match provider.as_str() {
        "auto" | "soundcloud" | "youtube" | "youtube-music" => provider.as_str(),
        _ => return Err("Unsupported audio provider.".into()),
    };
    let output_format = match audio_format.as_str() {
        "m4a" | "mp3" => audio_format.as_str(),
        _ => return Err("Unsupported audio format.".into()),
    };
    let query = query.trim();
    if query.is_empty() {
        return Err("Track title and artist are required.".into());
    }

    let output_template = directory.join("{artist} - {title}.{output-ext}");
    let spotify_url = spotify_url.filter(|url| url.starts_with("https://open.spotify.com/track/"));
    let source_url = source_url.filter(|url| {
        ["https://www.youtube.com/", "https://youtube.com/", "https://music.youtube.com/", "https://youtu.be/", "https://soundcloud.com/", "https://www.soundcloud.com/", "https://on.soundcloud.com/"]
            .iter().any(|prefix| url.starts_with(prefix))
    });
    let mut spotdl_error = None;
    let mut downloaded_path = None;

    if let Some(spotify_url) = spotify_url {
        let mut command = python_command();
        command.args(["-m", "spotdl", "download", &spotify_url]);
        command.args(["--format", output_format]);
        if audio_provider != "auto" {
            command.args(["--audio", audio_provider]);
        }
        if audio_provider != "youtube" && audio_provider != "auto" {
            command.arg("youtube");
        }
        let result = command.arg("--output").arg(&output_template).kill_on_drop(true).output().await;
        match result {
            Ok(output) if output.status.success() => {
                downloaded_path = find_downloaded_audio(directory, output_format);
            }
            Ok(output) => {
                spotdl_error = Some(String::from_utf8_lossy(&output.stderr).trim().to_string());
            }
            Err(error) => spotdl_error = Some(error.to_string()),
        }
        if downloaded_path.is_none() && spotdl_error.is_none() {
            spotdl_error = Some("spotDL finished without creating an audio file.".to_string());
        }
    }

    if downloaded_path.is_none() {
        let search = source_url.unwrap_or_else(|| {
            let search_prefix = if audio_provider == "soundcloud" { "scsearch1:" } else { "ytsearch1:" };
            let search_terms = query.replace(" - ", " ");
            format!("{search_prefix}{search_terms}")
        });
        let fallback_dir = directory.join("fallback");
        let fallback_output = fallback_dir.join("%(title)s.%(ext)s");
        let fallback = python_command()
            .args(["-m", "yt_dlp", "-x", "--audio-format", output_format, "--ffmpeg-location", r"C:\Users\lxst\.spotdl"])
            .arg(search)
            .arg("-o")
            .arg(fallback_output)
            .kill_on_drop(true)
            .output().await
            .map_err(|error| format!("Could not start Python for the yt-dlp fallback: {error}"))?;
        if !fallback.status.success() {
            let details = String::from_utf8_lossy(&fallback.stderr).trim().to_string();
            let fallback_error = if details.is_empty() {
                String::from_utf8_lossy(&fallback.stdout).trim().to_string()
            } else {
                details
            };
            let reason = spotdl_error.filter(|error| !error.is_empty())
                .map(|error| format!("spotDL: {error}\nyt-dlp: {fallback_error}"))
                .unwrap_or(fallback_error);
            return Err(if reason.is_empty() { "yt-dlp could not find or convert that track.".into() } else { reason });
        }
        downloaded_path = find_downloaded_audio(&fallback_dir, output_format);
    }

    let path = downloaded_path.ok_or_else(|| "Download completed, but no new MP3 or M4A file was found.".to_string())?;

    let fallback_title = path.file_stem().and_then(|name| name.to_str()).unwrap_or("Unknown track");
    let metadata_script = r#"import base64, json, sys
from mutagen import File
p = sys.argv[1]
result = {"title": "", "artist": "", "duration": None, "artwork_data_url": None}
audio = File(p)
if audio is not None:
    tags = audio.tags or {}
    def first(keys):
        for key in keys:
            value = tags.get(key)
            if value is not None:
                if isinstance(value, (list, tuple)):
                    value = value[0] if value else ""
                return str(value)
        return ""
    result["title"] = first(["TIT2", "title", "©nam"])
    result["artist"] = first(["TPE1", "artist", "©ART"])
    result["duration"] = getattr(getattr(audio, "info", None), "length", None)
    pictures = getattr(audio, "pictures", [])
    image = pictures[0].data if pictures else None
    if image is None:
        for value in tags.values():
            if value.__class__.__name__ == "APIC":
                image = value.data
                mime = getattr(value, "mime", "image/jpeg")
                break
            if isinstance(value, list) and value and value[0].__class__.__name__ == "MP4Cover":
                image = bytes(value[0])
                mime = "image/png" if getattr(value[0], "imageformat", 0) == 14 else "image/jpeg"
                break
    if image:
        result["artwork_data_url"] = "data:" + locals().get("mime", "image/jpeg") + ";base64," + base64.b64encode(image).decode("ascii")
print(json.dumps(result))"#;
    let metadata = python_command()
        .args(["-c", metadata_script])
        .arg(&path)
        .kill_on_drop(true)
        .output().await
        .ok()
        .filter(|output| output.status.success())
        .and_then(|output| serde_json::from_slice::<Value>(&output.stdout).ok())
        .unwrap_or(Value::Null);

    Ok((DownloadedTrack {
        path: String::new(),
        title: value_string(&metadata, &["title"]).filter(|value| !value.trim().is_empty()).unwrap_or_else(|| fallback_title.to_string()),
        artist: value_string(&metadata, &["artist"]).unwrap_or_default(),
        duration: metadata.get("duration").and_then(Value::as_f64),
        artwork_data_url: value_string(&metadata, &["artwork_data_url"]),
    }, path))
}

static DISCORD_CLIENT: OnceLock<Mutex<Option<discord_rich_presence::DiscordIpcClient>>> = OnceLock::new();

fn discord_client_slot() -> &'static Mutex<Option<discord_rich_presence::DiscordIpcClient>> {
    DISCORD_CLIENT.get_or_init(|| Mutex::new(None))
}

fn ensure_discord_client_connected() -> Result<(), String> {
    use discord_rich_presence::{DiscordIpc, DiscordIpcClient};

    let mut slot = discord_client_slot()
        .lock()
        .map_err(|_| "Discord IPC client lock was poisoned".to_string())?;
    if slot.is_none() {
        let mut client = DiscordIpcClient::new("1573525946106118284")
            .map_err(|error| format!("Could not create Discord IPC client: {error}"))?;
        client.connect()
            .map_err(|error| format!("Could not connect to Discord IPC pipe: {error}"))?;
        *slot = Some(client);
    }
    Ok(())
}

fn send_discord_presence(title: String, artist: String) -> Result<(), String> {
    use discord_rich_presence::{activity, DiscordIpc};

    ensure_discord_client_connected()?;
    let mut slot = discord_client_slot()
        .lock()
        .map_err(|_| "Discord IPC client lock was poisoned".to_string())?;
    let client = slot.as_mut().ok_or_else(|| "Discord IPC client is not connected".to_string())?;

    let result = if title.trim().is_empty() {
        client.clear_activity()
            .map_err(|error| format!("Could not clear Discord activity: {error}"))
    } else {
        let title = title.trim();
        let artist = if artist.trim().is_empty() { "Unknown artist" } else { artist.trim() };
        let activity = activity::Activity::new()
            .details(title)
            .state(artist)
            .activity_type(activity::ActivityType::Listening)
            .assets(activity::Assets::new().large_image("refract_logo"));
        client.set_activity(activity)
            .map_err(|error| format!("Could not set Discord activity: {error}"))
    };

    if result.is_err() {
        *slot = None;
    }
    result
}

#[tauri::command]
async fn update_discord_presence(title: String, artist: String) -> Result<(), String> {
    tokio::task::spawn_blocking(move || send_discord_presence(title, artist))
        .await
        .map_err(|error| format!("Discord presence task failed: {error}"))?
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            inspect_spotify_link,
            search_streaming_services,
            download_spotify_track,
            list_downloaded_tracks,
            clear_downloaded_tracks,
            write_background_video_chunk,
            list_background_videos,
            update_discord_presence,
        ])
        .setup(|_app| {
            if let Err(error) = ensure_discord_client_connected() {
                eprintln!("Discord IPC connection unavailable at startup: {error}");
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
    }   
