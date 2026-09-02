# Knowledge log

**Read this on the published site: <https://otaha2.github.io/mp3-frame-counter/>**

The pages in this folder are HTML, and GitHub shows HTML as source rather than
rendering it. Opening one here gives you the markup. The links below go to the
same files, served.

## The order to read them in

The domain first, then the system, then the measurements backing it up — and
last a walkthrough that hands you the job and finds out what stuck. Each step
assumes the ones above it.

|     | Page                                                                                                          | What it covers                                                             |
| --- | ------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| 1   | [MPEG-1 Layer III file structure](https://otaha2.github.io/mp3-frame-counter/concepts/mp3-structure.html)     | What a frame is, what the four header bytes mean, where tags sit.          |
| 2   | [Counting frames](https://otaha2.github.io/mp3-frame-counter/concepts/frame-counting.html)                    | The walk, the resynchronisation rule, and why one sync word is not enough. |
| 3   | [Counting as bytes arrive](https://otaha2.github.io/mp3-frame-counter/concepts/counting-as-bytes-arrive.html) | How the service counts without holding the file.                           |
| 4   | [Architecture](https://otaha2.github.io/mp3-frame-counter/model/architecture.html)                            | Layering, the path a request takes, the two counter designs compared.      |
| 5   | [Sample ground truth](https://otaha2.github.io/mp3-frame-counter/evidence/sample-ground-truth.html)           | Where the expected counts come from, and why two tools disagree.           |
| 6   | [Streaming counter measurements](https://otaha2.github.io/mp3-frame-counter/evidence/streaming-memory.html)   | Chunk-size invariance, memory over 417 MB, a 146 MB upload.                |
| 7   | [**Frame Walker**](https://otaha2.github.io/mp3-frame-counter/play/frame-walker.html)                         | Do it yourself on two files, and find out what you absorbed.               |

## Also here

- [Questions and answers](https://otaha2.github.io/mp3-frame-counter/qa.html) —
  the whole project in one page, then eight questions to test yourself against.
- [decisions.md](decisions.md) — every technical choice as a question, the
  options weighed, what was chosen and why. Markdown, so it renders here.
- [contributing.md](contributing.md) — how the code is laid out, the rules it is
  written to, and how to regenerate the test fixtures.

## Why the split

Each view renders one format and shows the other as source: GitHub renders
Markdown, the site renders HTML. Links throughout point at whichever view
renders their target, so an HTML page always sends you to the site and a
Markdown file always sends you here.
