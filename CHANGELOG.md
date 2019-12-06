# Changelog

## 2.3.0
- Removed check whether or not server is full
- Added report functionality back
  - Set `type` in the config to `REPORT`
- Added auto matchID (**Requires fetcher**)
  - Set `matchID` to `auto` to use
  - Only works on Valve Matchmaking servers

## 2.2.6
- Fix process being stuck on some occasions ([#147](https://github.com/BeepFelix/csgo-commend-bot/issues/147))

## 2.2.5
- Fixed error logging

## 2.2.4
- Do not allow full servers to be used ([#76](https://github.com/BeepFelix/csgo-commend-bot/issues/76))
- Error on VAC banned accounts ([#100](https://github.com/BeepFelix/csgo-commend-bot/issues/100))

## 2.2.3
- Handle response code 2 (Already commended)

## 2.2.2
- Fix logging bug

## 2.2.1
- Fix automatic Server ID finder now working

## 2.2.0
- Changed commending system to use numbers instead of boolean

## 2.1.0
- Added automatic Server ID finder

## 2.0.0
- Commend bot has been rewritten
