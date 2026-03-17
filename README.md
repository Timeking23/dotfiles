# dotfiles

My Hyprland rice on Manjaro Linux (ASUS ROG Zephyrus G14).

![Hyprland](https://img.shields.io/badge/WM-Hyprland-blue?style=flat-square)
![Manjaro](https://img.shields.io/badge/OS-Manjaro-35BF5C?style=flat-square)
![Wayland](https://img.shields.io/badge/Display-Wayland-yellow?style=flat-square)

## Overview

| Component        | Tool                                       |
| ---------------- | ------------------------------------------ |
| **WM**           | [Hyprland](https://hyprland.org)           |
| **Terminal**      | [Ghostty](https://ghostty.org) / [Kitty](https://sw.kovidgoyal.net/kitty/) |
| **Shell**         | [Fish](https://fishshell.com) + [Starship](https://starship.rs) prompt |
| **Bar**           | [Waybar](https://github.com/Alexays/Waybar) |
| **Launcher**      | [Rofi](https://github.com/davatorium/rofi) (adi1090x themes) |
| **Widgets**       | [AGS](https://github.com/Aylur/ags) (Aylur's GTK Shell) |
| **Wallpaper**     | [Hyprpaper](https://github.com/hyprwm/hyprpaper) |
| **Night Light**   | [wlsunset](https://sr.ht/~kennylevinsen/wlsunset/) |
| **Fetch**         | [Fastfetch](https://github.com/fastfetch-cli/fastfetch) (random anime logo on launch) |
| **File Manager**  | Dolphin |
| **Browser**       | Brave (Wayland-native) |
| **Font**          | JetBrains Mono Nerd Font |

## Features

- **Neon purple/bloom aesthetic** — purple active borders, glow shadows, bloom shader in Ghostty
- **NVIDIA + Wayland** — env vars pre-configured for RTX 4070 Max-Q on Hyprland
- **Transparent terminals** — 75% opacity with blur
- **Waybar** with custom Python scripts for media player, album colors, Notion integration, and VPN status
- **Rofi** with [adi1090x](https://github.com/adi1090x/rofi) theme collection for launchers and power menus
- **Fish shell** with a `brave-wayland` launcher function and randomized fastfetch logos on terminal open
- **Kitty** themed with Birds of Paradise color scheme

## Structure

```
dotfiles/
├── .config/
│   ├── hypr/              # Hyprland + Hyprpaper config
│   ├── ghostty/           # Ghostty terminal (bloom shader, Birds of Paradise)
│   ├── kitty/             # Kitty terminal + themes
│   ├── waybar/            # Bar config, styles, custom scripts
│   ├── rofi/              # Launcher + power menu themes
│   ├── fish/              # Shell config + custom functions
│   ├── fastfetch/         # System fetch config
│   ├── btop/              # System monitor config
│   ├── helix/             # Text editor config
│   ├── matugen/           # Material color generation
│   ├── foot/              # Foot terminal (backup)
│   ├── sway/              # Sway fallback config
│   ├── swappy/            # Screenshot annotation
│   ├── flashfocus/        # Window flash on focus
│   └── starship.toml      # Prompt theme
├── Documents/wallpaper/   # Wallpapers
├── Pictures/fastfetch-logos/  # Random logos for fastfetch
└── install.sh             # Symlink installer
```

## Install

```bash
# Clone
git clone https://github.com/Timeking23/dotfiles.git ~/dotfiles
cd ~/dotfiles

# Symlink everything to ~/.config
./install.sh
```

The install script backs up any existing configs to `.bak` before symlinking.

### Dependencies

Install on Manjaro/Arch:

```bash
yay -S hyprland hyprpaper ghostty kitty waybar rofi fish starship fastfetch \
       btop helix wlsunset swappy flashfocus brightnessctl playerctl \
       ttf-jetbrains-mono-nerd dolphin polkit-gnome
```

AGS is managed via Nix (`nix run ~/.config/ags`).

### Post-install

- Create `~/.config/waybar/notion.env` with your Notion API credentials (not tracked for security)
- Reload Hyprland: `hyprctl reload`
- Restart your terminal

## Keybindings

| Shortcut                     | Action              |
| ---------------------------- | ------------------- |
| `Super + T`                  | Open terminal       |
| `Super + A`                  | App launcher (Rofi) |
| `Super + B`                  | Brave browser       |
| `Super + Q`                  | Close window        |
| `Super + F`                  | Toggle floating     |
| `Super + Enter`              | Fullscreen          |
| `Super + E`                  | File manager        |
| `Super + S`                  | Scratchpad          |
| `Super + 1-0`                | Switch workspace    |
| `Super + Shift + 1-0`        | Move to workspace   |
| `Super + Arrow keys`         | Move focus          |
| `Super + LMB drag`           | Move window         |
| `Super + RMB drag`           | Resize window       |
| `Super + Delete`             | Exit Hyprland       |

## Hardware

- **Laptop:** ASUS ROG Zephyrus G14 (GA403UI)
- **CPU:** AMD Ryzen 9 8945HS
- **GPU:** NVIDIA RTX 4070 Max-Q (discrete) / AMD Radeon 780M (integrated)
- **RAM:** ~30 GB
