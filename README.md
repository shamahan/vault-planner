# Vault Planner

An unofficial layout planner for Fallout Shelter. Lay rooms out on the vault
grid, see immediately what the game would not let you build, keep the result as
a JSON file, share it as a link, and export it as a picture.

No backend. Everything lives in your browser, in a file, and in the URL.

It runs at <https://vault.shamahan.com/planner/>.

## Using it

- **Strict mode** (the default) enforces the game's connectivity rules: you can
  only dig down where there is an elevator, and you cannot delete a room that
  would cut others off from the vault door.
- **Free mode** switches those two rules off so you can sketch in any order.
  Geometry still holds. The mode is an editor setting: it is not written into
  the file and does not travel in the share link.
- Select a room, then use the arrow keys to move it a cell at a time,
  Delete or Backspace to remove it, and **1**, **2** or **3** to set its
  level. A new room is built at level 1, as in the game, and a level change
  applies to the whole room. Rooms of one type merge only when their levels
  match: a new room beside a level-3 one stays separate until it is raised
  to 3. Deleting a merged room removes it whole.
- Drag a room to move it. Dropped on free cells it lands in the nearest
  spot the rules allow; dropped on another room of the same width or
  narrower, the two trade places. A drop the rules refuse changes nothing
  and says why. While a room is being placed or carried, strips light up
  where it would keep a route to the vault door; under Free rules, dimmer
  ones show where it merely fits.

## Developing

```bash
npm install
npx playwright install --with-deps chromium  # once, before test:e2e
npm run dev       # local server
npm test          # unit tests
npm run test:e2e  # one browser scenario
npm run build     # production build
```

`npm run build` produces the whole site in `dist/`, which is exactly what
the deploy publishes: Vite writes the editor to `dist/planner`, then
`tools/assemble-site.mjs` lays `site/` over the top -- the landing page,
`og.png`, `robots.txt`, `sitemap.xml` and the `CNAME` file. The workflow
runs that same one command, so CI and a laptop build the same way.

The editor sits in a subdirectory because on the custom domain `dist/` is
the root of the site, so `/planner` has to be a real directory rather than
something the host prepends.

`npm run preview` serves that directory at `/`, landing page and editor
both, at the paths they will have in production. The e2e suite drives the
same server.

## The social card

`site/og.png` is what a link to the site unfurls into in a chat app or a
timeline. It is generated, not drawn by hand:

```bash
npm run og    # tools/og-image.html -> site/og.png
```

The PNG is committed because `site/` is copied to the deploy verbatim and
has no build step to make one. What is worth avoiding is a committed binary
nobody can reproduce, which is why its source sits beside the script in
`tools/` rather than in `site/` -- keeping it out of `site/` also keeps the
deploy from publishing it as a page of its own. Chromium comes from the
Playwright install the e2e suite already needs, so this adds no dependency,
and it is deliberately not part of `npm run build`: a build that silently
rewrote a committed binary on every run would be worse than remembering to
run this when the wording or the brand changes.

Two things it is easy to get wrong, both covered by
`tests/site/landing.test.ts`:

- `og:image:width` and `og:image:height` mean the file's real pixel size.
  The card is laid out at 1200x630 and rendered at 2x, so the file is
  2400x1260 and that is what the page declares. The test reads the numbers
  back out of the PNG's own header rather than taking the page's word.
- Both urls are absolute. A crawler fetching the card is not browsing the
  site and has no base to resolve a relative path against.

An SVG would have been the obvious thing to serve here and does not work:
most platforms, Facebook, X and Slack included, ignore an SVG `og:image`.

## Counting visits

The landing page carries a [GoatCounter](https://www.goatcounter.com/) tag
and nothing else counts anyone. It sets no cookie and stores nothing on the
device, so it needs no consent banner -- which is the whole reason it is
that and not Google Analytics. The Google tag that was here did need a
banner, and the banner cost the landing page more than its numbers were
worth: it would have counted only the visitors who agreed, to answer "did
anyone open this".

Cloudflare Web Analytics was the intended replacement and could not be set
up: its dashboard will register a hostname only as a zone on the account,
and the nameservers for this domain are not going to move -- they carry
mail. GoatCounter asked for nothing but a sign-up.

**It is on the landing page only, and this is load-bearing.** A share link
in the editor is `origin + pathname + '#' + encodeShare(vault)`, so there
the fragment *is* someone's layout. A counter that reported the url it
loaded on would file a stranger's vault with a third party, silently and in
production only. The landing page has no fragment to leak, and it is the
page whose reach was the question. `tests/site/landing.test.ts` asserts the
editor carries no non-module script at all, so adding one is a failing test
rather than a quiet leak.

The endpoint in the tag is public by design: it names the site being
counted, it is readable in the markup of every page that uses it, and there
is nothing in it to keep out of the repository. A test pins it, because a
tag pointing at the wrong instance loads perfectly and counts into a
dashboard nobody reads.

## Typefaces

Archivo and JetBrains Mono are served from this domain, out of `site/fonts`.
They used to be hotlinked from Google, which handed every visitor's IP to a
third party before the page had drawn anything -- on a page whose footer is
careful about exactly that. The counter was chosen to avoid it and the fonts
were undoing the choice, quietly, from the `<head>`.

Self-hosting is also faster. Hotlinking cost a DNS lookup and a TLS
handshake to `fonts.googleapis.com`, then a render-blocking stylesheet, then
the same again for `fonts.gstatic.com`, all before the first glyph could
begin downloading. Now the files arrive over a connection that is already
open, from `@font-face` rules the parser has already seen.

One variable file each, latin subset -- 73 KB, which is what a visitor was
downloading from Google anyway. Variable because the page uses 400, 500, 600
and 700 and a single axis covers them all. Latin because the only characters
on the page outside ASCII are an em dash, an en dash and a middot, all of
which that subset carries; anything else falls back to the system font, as
it already did for the subsets Google was not sending either.

To refresh them, fetch the stylesheet Google serves to a current browser,
take the `latin` block's URL for each family, and keep the descriptors
verbatim -- the weight ranges describe the files rather than stating a
preference.

## Licence and attribution

Code and artwork in this repository are © 2026 Oleksandr Kalinkin, all rights
reserved — see `LICENSE`. No licence to use, copy or redistribute them is
granted.

The two typefaces in `site/fonts` are not ours and are not covered by that.
Archivo and JetBrains Mono are both under the SIL Open Font License, whose
text ships beside them as the licence requires — `Archivo-OFL.txt` and
`JetBrainsMono-OFL.txt`, copyrights intact.

This project is unofficial and is not affiliated with, endorsed by, or
sponsored by Bethesda Softworks. *Fallout* and *Fallout Shelter* are
trademarks of their respective owners; the names are used descriptively to say
what this tool plans.

Every glyph here is drawn from SVG primitives. No artwork, sprite, screenshot
or logo from the game is included or linked. Room names, sizes and unlock
requirements are facts about the game, taken from the
[Fallout Wiki](https://fallout.fandom.com/wiki/Fallout_Shelter_rooms).
