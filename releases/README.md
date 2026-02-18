# Installer Parts

GitHub blocks files larger than 100 MB, so the Windows installer is stored in split parts.

## Rebuild the `.exe` from parts

Run from the repository root:

```bash
cat "releases/Easylab Suite Setup 0.1.3.exe.part-00" \
    "releases/Easylab Suite Setup 0.1.3.exe.part-01" \
  > "releases/Easylab Suite Setup 0.1.3.exe"
```

The block map is available as:

- `releases/Easylab Suite Setup 0.1.3.exe.blockmap`
