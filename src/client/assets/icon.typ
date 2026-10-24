#set page(width: 64pt, height: 64pt, margin: 0pt, fill: none)
#set rect(stroke: none)

#let background = rgb("#239dad")
#let ink = rgb("#0a3649")

#place(top + left, rect(
  width: 64pt,
  height: 64pt,
  radius: 14pt,
  fill: background,
))
#place(top + left, dx: 17pt, dy: 13pt, rect(
  width: 38pt,
  height: 30pt,
  radius: 5pt,
  fill: rgb("#11566c"),
  stroke: none,
))
#place(top + left, dx: 13pt, dy: 17pt, rect(
  width: 38pt,
  height: 30pt,
  radius: 5pt,
  fill: rgb("#79c5cf"),
  stroke: none,
))
#place(top + left, dx: 9pt, dy: 21pt, rect(
  width: 38pt,
  height: 30pt,
  radius: 5pt,
  fill: rgb("#fdfdfd"),
  stroke: none,
))
// Typst Brand Guidelines: https://typst.app/legal/brand/
#place(
  top + left,
  dx: 28pt - 14.4463pt * 1.04 / 2,
  dy: 36pt - 24.4061pt * 1.04 / 2,
  scale(
    x: 104.0%,
    y: 104.0%,
    origin: top + left,
    curve(
      fill: ink,
      stroke: none,
      curve.move((7.88785pt, 18.1481pt)),
      curve.cubic(
        (7.88785pt, 19.2805pt),
        (8.05033pt, 20.0404pt),
        (8.3753pt, 20.4278pt),
      ),
      curve.cubic(
        (8.70026pt, 20.8152pt),
        (9.29111pt, 21.0089pt),
        (10.1478pt, 21.0089pt),
      ),
      curve.cubic(
        (11.0341pt, 21.0089pt),
        (12.1715pt, 20.5619pt),
        (13.56pt, 19.6679pt),
      ),
      curve.line((14.4463pt, 21.143pt)),
      curve.cubic(
        (11.8465pt, 23.3184pt),
        (9.70471pt, 24.4061pt),
        (8.02079pt, 24.4061pt),
      ),
      curve.cubic(
        (6.33687pt, 24.4061pt),
        (5.00745pt, 24.0038pt),
        (4.03255pt, 23.1992pt),
      ),
      curve.cubic(
        (3.05765pt, 22.3648pt),
        (2.5702pt, 20.9046pt),
        (2.5702pt, 18.8186pt),
      ),
      curve.line((2.5702pt, 7.10728pt)),
      curve.line((0.35451pt, 7.10728pt)),
      curve.line((0pt, 5.45338pt)),
      curve.line((2.5702pt, 4.64879pt)),
      curve.line((2.5702pt, 2.45849pt)),
      curve.line((7.88785pt, 0pt)),
      curve.line((7.88785pt, 4.91699pt)),
      curve.line((13.1169pt, 4.51469pt)),
      curve.line((12.6294pt, 7.42018pt)),
      curve.line((7.88785pt, 7.24138pt)),
      curve.line((7.88785pt, 18.1481pt)),
      curve.close(),
    ),
  ),
)
