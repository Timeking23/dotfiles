# Save as ~/.config/fish/functions/bloom.fish
function bloom
    set text (string join " " $argv)
    # Light purple color code (Kitty supports 256 colors)
    set color 207
    for char in (string split "" $text)
        # Bold for extra pop
        printf "\e[1;38;5;%sm%s\e[0m" $color $char
    end
    echo
end
