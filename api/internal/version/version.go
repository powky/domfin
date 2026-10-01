// Package version says which Domfin this is and where its releases are
// published.
package version

// Version of Domfin, as its release on GitHub is tagged (without the "v").
// The app has the same one (app/app.json and app/package.json): raise all
// three with every release.
const Version = "0.1.0"

// Repo is the public repository Domfin's releases come from, as GitHub names
// it ("owner/name"). DOMFIN_REPO overrides it, for a fork that publishes its
// own.
const Repo = "powky/domfin"
