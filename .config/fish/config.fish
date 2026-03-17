if status is-interactive
    # Initialize Starship prompt
    starship init fish | source

    # Brave Wayland launcher for NVIDIA + Hyprland
    function brave-wayland
        # Wayland environment
        set -x QT_QPA_PLATFORM wayland
        set -x MOZ_ENABLE_WAYLAND 1

        # Chrome/Brave Wayland
        set -x OZONE_PLATFORM wayland

        # VA-API on NVIDIA
        set -x LIBVA_DRIVER_NAME vdpau

        brave --enable-features=UseOzonePlatform --ozone-platform=wayland
    end

    function fastfetch
        set img (ls ~/Pictures/fastfetch-logos/*.{jpg,png} 2>/dev/null | shuf -n1)
        if test -n "$img"
            command fastfetch --logo "$img"
        else
            command fastfetch
        end
    end

    fastfetch
end
