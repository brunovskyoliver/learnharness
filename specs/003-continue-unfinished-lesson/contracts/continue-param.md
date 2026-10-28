# Contract: `/chat/<id>?continue=1`

- Home's Continue links here. Any other value of `continue` is ignored.
- The page computes `continueDraft(lessonProgressOf(tree, messages))` from the record at request time. If the lesson has no progress (finished meanwhile), no draft is passed and the session opens as usual.
- Client: once the session state has hydrated, if the composer text is empty after trimming, set it to the draft; otherwise leave it. Then jump to the bottom and remove `continue` from the URL with `history.replaceState`. A reload opens the session as usual.
- Never sends a message.
