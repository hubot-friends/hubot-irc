# hubot-irc (compiled to JS from https://github.com/nandub/hubot-irc)

IRC Adapter for Hubot > version `9`.

# Trying it out

You can try this adapter out by cloning this repo, installing modules and starting the app. If you visit [Freenode](https://webchat.freenode.net) and connect to `#myhubot` and then execute the following commands:

```sh
npm i
npm start
```

You can send a message to `@irc-hubot helo` and it will reply.

# Submitting a PR

We're using `semantic-release` to cut releases from Git commit messages. If you submit a pull request, please make sure to prefix the commit messages with:

- `chore` - no release is cut (e.g. chore: Update build pipeline)
- `fix` - minor version release cut (e.g. fix: Reorder precedence of setting bot name from environment variable)
- `feat` - major version release cut (e.g. feat: some fantastic new feature)
- `BREAKING CHANGE` - if the changes break the public API, in addition to `feat`, add a message for BREAKING CHANGES
    ```
    feat: new feature
    BREAKING CHANGE: Public API was changed from v1 to v2
    ```
