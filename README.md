# Goods Sort Game Prototype

## Setup

`npm install`

## Build

`npm run build` to build the project manually.

`npm run watch` if you want to watch for changes and rebuild automatically after making changes.

## Run

You will need `http-server` installed globally:

`npm install -g http-server`

Then run:

`npm run start`

This will open the game in your default web browser.

## Editing

Edit the levels in `./content/*.json`

Make sure to run `npm run compile-content` after editing to compile the content files.

Edit `LoadingScene.ts` to change which level is loaded initially.
