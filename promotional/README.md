# Promotional slides

Seven vertical slides for TikTok / Reels / Shorts photo posts.

**1080 × 1920, rendered at 2× (2160 × 3840 PNG).** Post them in order as a
carousel, or use `slide-1` alone as a cover.

| | |
|---|---|
| `slide-1.png` | hook — the face, "Give your app a face." |
| `slide-2.png` | the sphere: eyes curve and foreshorten as they turn |
| `slide-3.png` | 16 of the 22 moods |
| `slide-4.png` | the whole integration, three lines |
| `slide-5.png` | theming, four CSS variables |
| `slide-6.png` | the numbers — 3.7 kB, 0 deps, MIT |
| `slide-7.png` | call to action |

Every face is rendered by the real library rather than drawn, so the slides
can't advertise something the code doesn't do.

## Regenerating

Edit `frontend/scripts/slides.html` in the incubator, then:

```bash
npm run build:face      # the slides import the built bundle
python3 make-slides.py  # -> promo/slide-*.png
```

## Suggested caption

> a 3.7 kB face for your website. it follows your cursor, blinks on its own, and
> has 22 moods. free and open source → bbot.bwnd.app

Note the faces are static here — the library is animated. A screen recording of
[bbot.bwnd.app](https://bbot.bwnd.app) makes a better video than these stills;
the slides are for photo-mode posts.
