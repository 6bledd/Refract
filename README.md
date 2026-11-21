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
