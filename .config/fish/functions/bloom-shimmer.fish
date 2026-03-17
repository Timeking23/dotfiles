# Save as ~/.config/fish/functions/bloom-shimmer.fish
function bloom-shimmer
    set text (string join " " $argv)
    set base_color 207       # light purple
    set pulse_colors 231 225 219 213 207 213 219 225 231   # pulse around base color

    while true
        for c in $pulse_colors
            clear
            for char in (string split "" $text)
                printf "\e[1;38;5;%sm%s\e[0m" $c $char
            end
            echo
            sleep 0.1
        end
    end
end
