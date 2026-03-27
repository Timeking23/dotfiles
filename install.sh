#!/usr/bin/env bash
# Dotfiles install script
# Installs dependencies, initializes submodules, and symlinks configs
# Usage: ./install.sh [--deps-only | --link-only]

set -euo pipefail

DOTFILES_DIR="$(cd "$(dirname "$0")" && pwd)"

# ---------------------------------------------------------------------------
# Colors
# ---------------------------------------------------------------------------
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

info()  { echo -e "${CYAN}[INFO]${NC}  $*"; }
ok()    { echo -e "${GREEN}[ OK ]${NC}  $*"; }
warn()  { echo -e "${YELLOW}[WARN]${NC}  $*"; }
err()   { echo -e "${RED}[ERR ]${NC}  $*"; }

# ---------------------------------------------------------------------------
# Dependency installation
# ---------------------------------------------------------------------------
install_deps() {
    info "Checking for pacman..."
    if ! command -v pacman &>/dev/null; then
        err "pacman not found — this script is built for Arch-based distros (Manjaro, Arch, EndeavourOS)."
        exit 1
    fi

    # --- Official repo packages (pacman) ---
    PACMAN_PKGS=(
        # Window manager & Wayland
        hyprland
        hyprpaper
        xdg-desktop-portal-hyprland
        sway

        # Terminals
        kitty
        ghostty
        foot

        # Shell & prompt
        fish
        starship

        # Launcher
        rofi

        # Editors
        helix

        # System tools
        zenity
        btop
        fastfetch
        imagemagick
        brightnessctl
        playerctl
        jq
        wl-clipboard
        cliphist
        swappy
        grim
        slurp

        # Audio / network / bluetooth
        pipewire
        wireplumber
        pavucontrol
        network-manager-applet

        # Desktop integration
        polkit-gnome
        dolphin
        qt5ct
        qt6ct
        python-pillow

        # Fonts
        ttf-firacode-nerd
        ttf-material-symbols-variable

        # AGS runtime dependencies
        dart-sass
        libgtop

        # ASUS hardware control
        asusctl
    )

    info "Installing official repo packages..."
    sudo pacman -S --needed --noconfirm "${PACMAN_PKGS[@]}"
    ok "Official packages installed."

    # --- AUR packages (yay) ---
    if ! command -v yay &>/dev/null; then
        warn "yay not found — installing yay-bin from AUR..."
        tmpdir=$(mktemp -d)
        git clone https://aur.archlinux.org/yay-bin.git "$tmpdir/yay-bin"
        (cd "$tmpdir/yay-bin" && makepkg -si --noconfirm)
        rm -rf "$tmpdir"
        ok "yay installed."
    fi

    AUR_PKGS=(
        # Browser
        brave-bin

        # Theming
        matugen-bin

        # Utilities
        flashfocus
        rofi-bluetooth-git
        networkmanager-dmenu-git
        linux-wallpaperengine-git

        # AGS (Aylur's GTK Shell) + Astal libraries
        aylurs-gtk-shell
        libastal-git
        libastal-io-git
        libastal-4-git
        libastal-apps-git
        libastal-battery-git
        libastal-bluetooth-git
        libastal-cava-git
        libastal-hyprland-git
        libastal-mpris-git
        libastal-network-git
        libastal-notifd-git
        libastal-powerprofiles-git
        libastal-tray-git
        libastal-wireplumber-git
    )

    info "Installing AUR packages..."
    yay -S --needed --noconfirm "${AUR_PKGS[@]}"
    ok "AUR packages installed."

    echo ""
    ok "All dependencies installed!"
}

# ---------------------------------------------------------------------------
# Initialize git submodules (AGS + rofi themes)
# ---------------------------------------------------------------------------
init_submodules() {
    info "Initializing git submodules..."
    cd "$DOTFILES_DIR"
    git submodule update --init --recursive
    ok "Submodules initialized."
}

# ---------------------------------------------------------------------------
# Symlink configs
# ---------------------------------------------------------------------------
link() {
    local src="$DOTFILES_DIR/$1"
    local dest="$HOME/$1"

    mkdir -p "$(dirname "$dest")"

    # Back up existing file/dir if it's not already a symlink
    if [ -e "$dest" ] && [ ! -L "$dest" ]; then
        warn "Backing up existing $dest -> ${dest}.bak"
        mv "$dest" "${dest}.bak"
    fi

    ln -sfn "$src" "$dest"
    ok "Linked $dest"
}

link_configs() {
    info "Linking configs..."
    link .config/hypr
    link .config/kitty
    link .config/rofi
    link .config/rofi.ryona
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
    link .config/ags

    echo ""
    info "Linking assets..."
    link Documents/wallpaper
    link Pictures/fastfetch-logos

    echo ""
    ok "All configs linked!"
}

# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------
echo ""
echo -e "${CYAN}========================================${NC}"
echo -e "${CYAN}  Dotfiles Installer${NC}"
echo -e "${CYAN}========================================${NC}"
echo ""

case "${1:-all}" in
    --deps-only)
        install_deps
        ;;
    --link-only)
        init_submodules
        link_configs
        ;;
    all|"")
        install_deps
        echo ""
        init_submodules
        echo ""
        link_configs
        ;;
    *)
        echo "Usage: ./install.sh [--deps-only | --link-only]"
        exit 1
        ;;
esac

echo ""
echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}  Done!${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""
echo "You may need to:"
echo "  - Reload Hyprland:  hyprctl reload"
echo "  - Restart your terminal"
echo "  - Set fish as default shell:  chsh -s /usr/bin/fish"
echo ""
