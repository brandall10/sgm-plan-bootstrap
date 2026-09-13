# Offline recovery behavior notes

The saved snapshot is a bounded local record of completed exercises. A write
does not become visible as saved until the write has completed successfully.

When a write fails, the last valid snapshot remains restorable and the caller
receives an unsaved outcome. A malformed or incompatible snapshot is reported
as unavailable, rather than being converted into a new empty session.

Starting over creates a new session generation. Work queued by the discarded
generation must not publish after that boundary, even if the storage callback
finishes later.
