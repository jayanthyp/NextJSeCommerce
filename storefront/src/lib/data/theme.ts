"use server"

import { getTheme, setThemeCookie, ThemePreference } from "./cookies"

export const getThemePreference = async (): Promise<ThemePreference> => {
  return getTheme()
}

export const setThemePreference = async (theme: ThemePreference) => {
  await setThemeCookie(theme)
}
