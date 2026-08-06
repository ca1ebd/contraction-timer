# contraction-timer

## Sharing work for review

When work is pushed for review, don't stop at "pushed" — watch the staging
deploy through to success, then hand over the link directly:

<https://contraction-timer.test.calebdudley.dev>

Confirm the deploy actually carries the commit before sharing it. The About
sheet shows a 7-character build sha, and the same string is inlined into the JS
bundle at build time from `VITE_COMMIT_SHA`, so it can be checked without a
browser:

```sh
curl -s https://contraction-timer.test.calebdudley.dev/ \
  | grep -o 'assets/index-[A-Za-z0-9_-]*\.js'
```

### Staging is a single shared slot

`.github/workflows/azure-static-web-apps-staging.yml` fires on every branch
except `main` and passes no per-branch environment, so **all** feature branches
deploy to that one URL and the last successful run wins. Two pushes close
together will fight: the later one cancels the earlier's deployment, which
surfaces as `Deployment Failed / Deployment Canceled` after a green build. That
is a race, not a broken build — re-run the job that lost.

Deploying one branch to test therefore replaces whatever was there. Say so when
it displaces something the reviewer was looking at.

### Watching runs

```sh
gh run watch <run-id> --exit-status
```

Piping that to `tail` or `head` reports the exit status of the *pipe*, not the
run — a failed deploy will look like it passed. Redirect to `/dev/null` and read
`$?`, or confirm with `gh run list` afterwards.

## Production

`main` deploys to <https://contraction-timer.calebdudley.dev> via
`.github/workflows/azure-static-web-apps.yml`.
