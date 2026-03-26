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
| **Launcher**      | [Rofi](https://github.com/davatorium/rofi) ([adi1090x](https://github.com/adi1090x/rofi) themes) |
| **Widgets**       | [AGS](https://github.com/Aylur/ags) (Aylur's GTK Shell) via [matshell](https://github.com/Neurarian/matshell) |
| **Wallpaper**     | [Hyprpaper](https://github.com/hyprwm/hyprpaper) / [linux-wallpaperengine](https://github.com/Almamu/linux-wallpaperengine) |
| **Fetch**         | [Fastfetch](https://github.com/fastfetch-cli/fastfetch) (random anime logo on launch) |
| **File Manager**  | Dolphin |
| **Browser**       | Brave (Wayland-native) |

## Features

- **Neon purple/bloom aesthetic** — purple active borders, glow shadows, bloom shader in Ghostty
- **NVIDIA + Wayland** — env vars pre-configured for RTX 4070 Max-Q on Hyprland
- **Transparent terminals** — 75% opacity with blur
- **AGS widgets** — custom sidebar with calendar, Notion integration, wallpaper picker, media controls
- **Rofi** with adi1090x theme collection for launchers and power menus
- **Fish shell** with Starship prompt and randomized fastfetch logos on terminal open
- **12 Ghostty shaders** — bloom, CRT, matrix rain, vignette, glitch, and more
- **Night light toggle** — shader-based blue light filter via keybind

## Repo Structure

```
dotfiles/
├── .config/
│   ├── ags/               # AGS widgets (git submodule: Timeking23/matshell)
│   ├── hypr/              # Hyprland config, colors, shaders, nightlight toggle
│   ├── ghostty/           # Ghostty terminal config + 12 shaders
│   ├── kitty/             # Kitty terminal + themes
│   ├── rofi/              # Rofi base config
│   ├── rofi.ryona/        # Custom Rofi launcher (themes submodule: adi1090x/rofi)
│   ├── fish/              # Fish shell config + functions
│   ├── fastfetch/         # System fetch config
│   ├── btop/              # System monitor config
│   ├── helix/             # Text editor config
│   ├── matugen/           # Material color generation
│   ├── foot/              # Foot terminal (backup)
│   ├── sway/              # Sway fallback config
│   ├── swappy/            # Screenshot annotation
│   ├── flashfocus/        # Window flash on focus
│   └── starship.toml      # Prompt theme
├── Documents/wallpaper/
├── Pictures/fastfetch-logos/
└── install.sh
```

---

## Installation (Step by Step)

### Prerequisites

- An **Arch-based** distro (Manjaro, Arch, EndeavourOS)
- `git` installed (`sudo pacman -S git`)
- A working internet connection
- `base-devel` installed (`sudo pacman -S --needed base-devel`) — needed for AUR builds

### Step 1: Clone the repo

Clone with `--recursive` so the git submodules (AGS widgets + Rofi themes) are pulled in automatically:

```bash
git clone --recursive https://github.com/Timeking23/dotfiles.git ~/dotfiles
cd ~/dotfiles
```

> If you already cloned without `--recursive`, run:
> ```bash
> git submodule update --init --recursive
> ```

### Step 2: Run the installer

The install script does three things in order:
1. Installs all required packages (pacman + AUR via yay)
2. Initializes git submodules
3. Symlinks all configs to `~/.config/`

```bash
chmod +x install.sh
./install.sh
```

The script will ask for your `sudo` password to install packages.

> Any existing configs at the symlink destinations are backed up to `*.bak` — nothing gets deleted.

### Step 3: Post-install setup

After the script finishes:

```bash
# Set fish as your default shell (if it isn't already)
chsh -s /usr/bin/fish

# Reload Hyprland to pick up the new config
hyprctl reload

# Restart your terminal
```

### Optional flags

You can run parts of the installer separately:

```bash
# Only install packages (no symlinking)
./install.sh --deps-only

# Only symlink configs (skip package installation)
./install.sh --link-only
```

---

## What Gets Installed

### Official packages (pacman)

`hyprland` `hyprpaper` `xdg-desktop-portal-hyprland` `sway` `kitty` `ghostty` `foot` `fish` `starship` `rofi` `helix` `btop` `fastfetch` `brightnessctl` `playerctl` `jq` `wl-clipboard` `cliphist` `swappy` `grim` `slurp` `pipewire` `wireplumber` `pavucontrol` `network-manager-applet` `polkit-gnome` `dolphin` `qt5ct` `qt6ct` `python-pillow`

### AUR packages (yay)

`brave-bin` `matugen-bin` `flashfocus` `rofi-bluetooth-git` `networkmanager-dmenu-git` `linux-wallpaperengine-git` `aylurs-gtk-shell` `libastal-git` `libastal-io-git` `libastal-4-git` `libastal-apps-git` `libastal-battery-git` `libastal-bluetooth-git` `libastal-cava-git` `libastal-hyprland-git` `libastal-mpris-git` `libastal-network-git` `libastal-notifd-git` `libastal-powerprofiles-git` `libastal-tray-git` `libastal-wireplumber-git`

---

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
| `Super + Shift + N`          | Toggle night light  |
| `Super + Delete`             | Exit Hyprland       |

## Hardware

- **Laptop:** ASUS ROG Zephyrus G14 (GA403UI)
- **CPU:** AMD Ryzen 9 8945HS
- **GPU:** NVIDIA RTX 4070 Max-Q (discrete) / AMD Radeon 780M (integrated)
- **RAM:** ~30 GB
