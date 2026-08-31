# Decisions

Every technical choice gets a row: what was decided, what else was considered,
why, and where the evidence lives.

| # | Decision | Alternatives considered | Reason | Evidence |
|---|----------|------------------------|--------|----------|
| D1 | `frameCount` = physical frames **minus** the Xing/Info/VBRI metadata frame when one is present (sample → 6089). | (a) Count every physical sync-framed unit (sample → 6090). (b) Trust the Xing header's own frame-count field without walking. | The assignment says to verify with mediainfo, and mediainfo, `ffprobe -count_frames`, and the file's own Xing field all report 6089: the metadata frame carries no audio, and every reference tool excludes it. (b) is rejected because the count must come from logically parsing frames — the Xing field becomes a cross-check, not the source. | [docs/evidence/sample-ground-truth.html](docs/evidence/sample-ground-truth.html) |
