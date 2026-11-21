# RefractPlayer

RefractPlayer can import local audio and use spotDL to read track metadata from Spotify links. Spotify links are never downloaded by this integration: the app builds search links for SoundCloud, YouTube Music, and YouTube.

## Spotify link search

Install [spotDL](https://github.com/spotDL/spotify-downloader) and make sure the `spotdl` command is available on your PATH. For example, with Python installed:

```sh
python -m pip install spotdl
```

Paste a Spotify track, album, or playlist link into **Find from Spotify** and choose a service to open its search page. Searching returns metadata only; selecting a service opens that provider in your browser.

## Development

```sh
npm install
npm run tauri dev
```

## Recommended IDE Setup

- [VS Code](https://code.visualstudio.com/) + [Tauri](https://marketplace.visualstudio.com/items?itemName=tauri-apps.tauri-vscode) + [rust-analyzer](https://marketplace.visualstudio.com/items?itemName=rust-lang.rust-analyzer)

Development and Testing

Refract originally started as a personal music player, built for my own everyday use. As the project developed and exceeded my expectations, I decided to make it open source.

Refract is developed with the assistance of AI coding tools, including OpenAI Codex.

Every feature is personally tested before release, and I use Refract as my main music player. This helps me identify bugs and usability issues through regular use.

The project also uses automated security scanning to help identify potential vulnerabilities.

While no software can be guaranteed completely bug-free or secure, I aim to keep Refract transparent, reliable, and continuously improving.

Operating Systems 

Platform Support

Refract is currently developed and tested for Windows.

Windows installers are available in .exe and .msi formats through GitHub Releases.

Linux and macOS support may be considered in the future, but are not currently supported.

My priority is to provide a stable and reliable experience on Windows before expanding to other platforms.
