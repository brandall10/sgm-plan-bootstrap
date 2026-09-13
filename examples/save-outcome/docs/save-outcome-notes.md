# Save outcome contract

Completing an exercise and persisting its progress are separate events. The
caller receives `saved` only after the durable snapshot succeeds. If the write
fails, the result is `unsaved` and the previous valid snapshot remains intact.
