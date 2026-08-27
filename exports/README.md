# exports/

Saved prompt files land here, one per perfume:

```
ibraq-black-diamond-incense-prompt-4x5.txt
<brand>-<name>-<variant>-prompt-<ratio>.txt
```

Each file contains the base prompt plus the line to append for each alternative take,
so a whole set can be produced in an image tool without going back to the app.

Re-saving the same perfume overwrites its file rather than piling up duplicates.

The `.txt` files are gitignored; this README keeps the folder in the tree. Change the
location with `STUDIO_EXPORT_DIR` in `.env.local`.
