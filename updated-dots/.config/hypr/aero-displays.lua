local function aero_has(name)
    local ok, list = pcall(hl.get_monitors)
    if not ok or type(list) ~= "table" then
        return false
    end
    for _, m in ipairs(list) do
        local okn, n = pcall(function() return m.name end)
        if okn and n == name then
            return true
        end
    end
    return false
end

hl.monitor({ output = "eDP-2", disabled = false, mode = "2880x1800@120", position = "0x0", scale = 1.8 })
