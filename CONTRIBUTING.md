# Contributing

Thanks for helping make Trick or Take more fun to play and easier to understand.

1. Fork the repository and create a focused branch.
2. Follow the local setup in the README. Use your own `.dev.vars` for optional services.
3. Make a small, reviewable change. Describe the problem and the resulting behavior.
4. Run `npm test`, `npm run build`, and `npm run test:smoke`.
5. Open a pull request with the checks you ran and screenshots when the UI changes.

For gameplay changes, update the shared engine and verify solo/server behavior together. Preserve old rules profiles when existing results still need replay. For text changes, update both English and Chinese messages and check the initial server-rendered loading state. For visual changes, inspect both a narrow phone and a desktop layout.

Never include credentials, `.dev.vars`, local D1 databases, room capabilities, or personal analytics data. Keep SDK license headers and font notices intact. Use a private security report for sensitive issues.
