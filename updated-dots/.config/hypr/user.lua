local home = os.getenv("HOME")

hl.bind("SUPER + F12", hl.dsp.exec_cmd("ghostty --class=aero.float -e nano " .. home .. "/.config/hypr/user.lua"))
hl.bind("SUPER + Return", hl.dsp.window.fullscreen({ action = "toggle" }))

-- lower input latency in Steam games: skip the compositor's vsync wait
hl.config({ general = { allow_tearing = true } })
hl.window_rule({
    name  = "steam-game-tearing",
    match = { class = "^steam_app_.*$" },

    immediate = true,
})
