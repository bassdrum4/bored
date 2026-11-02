# Personal game notes

Bored's regular, searchable descriptions are in `src/games/catalog.js`.
Longer first-person notes are in **`src/games/developer-notes.js`**.

To add one, write another entry using its game slug from `ORDER`, e.g.:

```js
'minigolf': "I made the obstacles harder to ignore. The ball disagrees.",
```

Only games with a note show an info button. Hover over the game card on
desktop or tab to it; on a phone tap the `i` to open the note. Tap away
or press Escape to dismiss it. Notes also appear on Jump Back In cards.

No changes to games, score rules or Supabase are needed. Text is displayed
safely as plain text. These notes are public; check with anyone named in them.
Copyright law concerns hosting/distribution rights, not merely playing games.

Run `npm test` for regression checks.
