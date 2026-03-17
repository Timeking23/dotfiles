#!/usr/bin/env bash
# Dotfiles install script
# Symlinks configs from this repo to their expected locations
# Usage: ./install.sh

set -euo pipefail

DOTFILES_DIR="$(cd "$(dirname "$0")" && pwd)"

link() {
    local src="$DOTFILES_DIR/$1"
    local dest="$HOME/$1"

    # Create parent directory if needed
    mkdir -p "$(dirname "$dest")"

    # Back up existing file/dir if it's not already a symlink
    if [ -e "$dest" ] && [ ! -L "$dest" ]; then
        echo "  Backing up existing $dest -> ${dest}.bak"
        mv "$dest" "${dest}.bak"
    fi

    ln -sfn "$src" "$dest"
    echo "  Linked $dest -> $src"
}

echo "Installing dotfiles from $DOTFILES_DIR"
echo ""

# Configs
echo "Linking configs..."
link .config/hypr
link .config/kitty
link .config/waybar
link .config/rofi
link .config/fish
link .config/ghostty
link .config/fastfetch
link .config/btop
link .config/foot
link .config/helix
link .config/matugen
link .config/swappy
link .config/sway
link .config/flashfocus
link .config/starship.toml

# Assets
echo ""
echo "Linking assets..."
link Documents/wallpaper
link Pictures/fastfetch-logos

echo ""
echo "Done! You may need to:"
echo "  - Reload Hyprland: hyprctl reload"
echo "  - Restart your terminal"
echo "  - Re-create waybar/notion.env with your API tokens (not tracked for security)"
