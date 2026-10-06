# Every film opens on Aloha and closes on Mahalo

*Measured 2026-10-06 by `npm run trim:measure`, read-only, over every published film. Nothing has been cut.*

Thresholds: head > 1s, tail > 1.5s. Pads: 0.3s before Aloha, 0.7s after Mahalo. Model: `small.en`.

## Counts

| | films |
|---|---:|
| published, measured | 447 |
| screened into the word pass | 269 |
| **to cut, head only** | **23** |
| **to cut, tail only** | **47** |
| **to cut, both ends** | **184** |
| **to cut, total** | **254** |
| fine as they are | 187 |
| pending the word pass | 8 |
| no greeting heard | 3 |
| no sign-off heard | 4 |
| offset suspect, nothing proposed | 8 |
| no English text track | 0 |
| errored | 4 |

Dead air to be removed: **65.1 minutes** across 254 films, out of 1013 minutes of library (6.4%).

## The cut, sorted by how much comes off

`start` and `end` are what `trim:apply` passes to `replace:video --trim-only`. A dash means that side is **not touched** — which is how a film whose head was already cut by `trim:slates` gets its tail cut and its head left alone.

| # | head | tail | off | dur | start | end | by | ledger | collection | title |
|---:|---:|---:|---:|---:|---:|---:|:--|:--|:--|---|
| 1 | 21.50 | 5.88 | 26.38 | 198.50 | 21.20 | 193.32 | ww | — | Menu | 90,000 Mile Dealer Upsell Menu |
| 2 | 20.52 | 5.87 | 25.39 | 156.47 | 20.22 | 151.30 | ww | — | Menu | 15,000 Mile Dealer Upsell Menu, Part 1 |
| 3 | 18.24 | 7.64 | 24.87 | 75.50 | 17.94 | 68.57 | ww | — | Menu | 105,000 Mile Dealer Upsell Menu, Part 1 |
| 4 | 18.38 | 7.29 | 24.67 | 86.60 | 18.08 | 80.01 | ww | — | Menu | 10,000 Mile Dealer Upsell Menu, Part 1 |
| 5 | 18.04 | 7.15 | 24.19 | 185.21 | 17.74 | 178.76 | ww | — | Menu | 100,000 Mile Dealer Upsell Menu, Part 4 |
| 6 | 16.70 | 8.48 | 24.18 | 97.17 | 16.40 | 89.39 | ww | — | Menu | 105,000 Mile Dealer Upsell Menu, Part 2 |
| 7 | 18.88 | 6.27 | 24.15 | 232.07 | 18.58 | 226.50 | ww | — | Menu | 45,000 Mile Dealer Upsell Menu, Part 4 |
| 8 | 17.46 | 7.68 | 24.14 | 187.14 | 17.16 | 180.16 | ww | — | Menu | 60,000 Mile Dealer Upsell Menu, Part 2 |
| 9 | 18.84 | 6.21 | 24.05 | 187.94 | 18.54 | 182.43 | ww | — | Menu | 100,000 Mile Dealer Upsell Menu, Part 2 |
| 10 | 18.12 | 6.91 | 24.03 | 145.67 | 17.82 | 139.46 | ww | — | Menu | 35,000 Mile Dealer Upsell Menu, Part 3 |
| 11 | 18.96 | 5.84 | 23.79 | 158.10 | 18.66 | 152.97 | ww | — | Menu | 150,000 Mile Dealer Upsell Menu, Part 1 |
| 12 | 16.58 | 8.11 | 23.69 | 199.44 | 16.28 | 192.03 | ww | — | Menu | 35,000 Mile Dealer Upsell Menu, Part 2 |
| 13 | 18.54 | 6.11 | 23.65 | 184.14 | 18.24 | 178.73 | ww | — | Menu | 65,000 Mile Dealer Upsell Menu, Part 2 |
| 14 | 17.78 | 6.75 | 23.52 | 178.87 | 17.48 | 172.83 | ww | — | Menu | 15,000 Mile Dealer Upsell Menu, Part 3 |
| 15 | 17.34 | 7.08 | 23.42 | 128.24 | 17.04 | 121.86 | ww | — | Menu | 10,000 Mile Dealer Upsell Menu, Part 2 |
| 16 | 17.18 | 7.24 | 23.42 | 129.54 | 16.88 | 123.00 | ww | — | Menu | 10,000 Mile Dealer Upsell Menu |
| 17 | 16.28 | 8.11 | 23.39 | 156.40 | 15.98 | 148.99 | ww | — | Menu | 25,000 Mile Dealer Upsell Menu, Part 4 |
| 18 | 17.84 | 6.42 | 23.25 | 205.34 | 17.54 | 199.63 | ww | — | Menu | 45,000 Mile Dealer Upsell Menu, Part 2 |
| 19 | 18.04 | 6.21 | 23.25 | 198.91 | 17.74 | 193.40 | ww | — | Menu | 110,000 Mile Dealer Upsell Menu |
| 20 | 17.62 | 6.58 | 23.19 | 141.10 | 17.32 | 135.23 | ww | — | Menu | 80,000 Mile Dealer Upsell Menu, Part 1 |
| 21 | 17.02 | 7.10 | 23.13 | 189.91 | 16.72 | 183.50 | ww | — | Menu | 60,000 Mile Dealer Upsell Menu, Part 4 |
| 22 | 19.38 | 4.74 | 23.12 | 163.24 | 19.08 | 159.20 | ww | — | Menu | 150,000 Mile Dealer Upsell Menu, Part 2 |
| 23 | 17.20 | 6.87 | 23.07 | 103.67 | 16.90 | 97.50 | ww | — | Menu | 50,000 Mile Dealer Upsell Menu, Part 3 |
| 24 | 17.66 | 6.39 | 23.05 | 218.97 | 17.36 | 213.28 | ww | — | Menu | 150,000 Mile Dealer Upsell Menu, Part 4 |
| 25 | 16.98 | 6.98 | 22.95 | 129.60 | 16.68 | 123.33 | ww | — | Menu | 50,000 Mile Dealer Upsell Menu, Part 2 |
| 26 | 17.46 | 6.44 | 22.90 | 155.37 | 17.16 | 149.63 | ww | — | Menu | 40,000 Mile Dealer Upsell Menu, Part 1 |
| 27 | 17.18 | 6.63 | 22.81 | 147.27 | 16.88 | 141.34 | ww | — | Menu | 90,000 Mile Dealer Upsell Menu, Part 1 |
| 28 | 17.20 | 6.58 | 22.79 | 212.84 | 16.90 | 206.95 | ww | — | Menu | 55,000 Mile Dealer Upsell Menu, Part 1 |
| 29 | 17.92 | 5.86 | 22.79 | 164.01 | 17.62 | 158.84 | ww | — | Menu | 10,000 Mile Dealer Upsell Menu, Part 4 |
| 30 | 17.68 | 6.00 | 22.68 | 137.84 | 17.38 | 132.54 | ww | — | Menu | 120,000 Mile Dealer Upsell Menu, Part 1 |
| 31 | 17.76 | 5.92 | 22.68 | 162.61 | 17.46 | 157.39 | ww | — | Menu | 15,000 Mile Dealer Upsell Menu, Part 5 |
| 32 | 18.34 | 5.31 | 22.66 | 100.64 | 18.04 | 96.02 | ww | — | Menu | 45,000 Mile Dealer Upsell Menu, Part 1 |
| 33 | 16.98 | 6.65 | 22.63 | 118.14 | 16.68 | 112.19 | ww | — | Menu | 25,000 Mile Dealer Upsell Menu, Part 3 |
| 34 | 17.38 | 6.22 | 22.60 | 266.94 | 17.08 | 261.42 | ww | — | Menu | 30,000 Mile Dealer Upsell Menu (2769) |
| 35 | 19.08 | 4.52 | 22.59 | 182.87 | 18.78 | 179.06 | ww | — | Menu | 120,000 Mile Dealer Upsell Menu, Part 4 |
| 36 | 16.92 | 6.40 | 22.31 | 165.27 | 16.62 | 159.58 | ww | — | Menu | 65,000 Mile Dealer Upsell Menu, Part 1 |
| 37 | 15.78 | 7.50 | 22.28 | 65.07 | 15.48 | 58.27 | ww | — | Menu | 50,000 Mile Dealer Upsell Menu, Part 4 |
| 38 | 17.48 | 5.74 | 22.22 | 196.97 | 17.18 | 191.93 | ww | — | Menu | EV Series, Part 1 |
| 39 | 16.38 | 6.85 | 22.22 | 145.10 | 16.08 | 138.96 | ww | — | Menu | 5,000/7,500 Mile Dealer Upsell Menu (2714) |
| 40 | 18.16 | 4.94 | 22.11 | 259.48 | 17.86 | 255.23 | ww | — | Menu | EV Series, Part 4 |
| 41 | 17.40 | 5.59 | 21.99 | 165.01 | 17.10 | 160.12 | ww | — | Menu | 25,000 Mile Dealer Upsell Menu (2749) |
| 42 | 16.78 | 6.08 | 21.86 | 146.77 | 16.48 | 141.39 | ww | — | Menu | 15,000 Mile Dealer Upsell Menu, Part 2 |
| 43 | 16.30 | 6.53 | 21.83 | 151.67 | 16.00 | 145.84 | ww | — | Menu | 80,000 Mile Dealer Upsell Menu, Part 2 |
| 44 | 15.42 | 7.38 | 21.80 | 161.78 | 15.12 | 155.10 | ww | — | Menu | 70,000 Mile Dealer Upsell Menu, Part 2 (2822) |
| 45 | 16.64 | 6.07 | 21.71 | 159.44 | 16.34 | 154.07 | ww | — | Menu | 30,000 Mile Dealer Upsell Menu, Part 3 |
| 46 | 17.06 | 5.64 | 21.70 | 157.44 | 16.76 | 152.50 | ww | — | Menu | 30,000 Mile Dealer Upsell Menu (2760) |
| 47 | 16.98 | 5.71 | 21.69 | 125.77 | 16.68 | 120.76 | ww | — | Menu | 75,000 Mile Dealer Upsell Menu, Part 3 |
| 48 | 16.78 | 5.89 | 21.67 | 131.94 | 16.48 | 126.75 | ww | — | Menu | 75,000 Mile Dealer Upsell Menu, Part 2 |
| 49 | 16.54 | 6.00 | 21.54 | 136.71 | 16.24 | 131.41 | ww | — | Menu | 95,000 Mile Dealer Upsell Menu |
| 50 | 16.08 | 6.37 | 21.45 | 192.97 | 15.78 | 187.30 | ww | — | Menu | 75,000 Mile Dealer Upsell Menu, Part 1 |
| 51 | 15.78 | 6.57 | 21.35 | 160.14 | 15.48 | 154.27 | ww | — | Menu | 40,000 Mile Dealer Upsell Menu, Part 2 |
| 52 | 16.80 | 5.43 | 21.23 | 194.81 | 16.50 | 190.08 | ww | — | Menu | 100,000 Mile Dealer Upsell Menu, Part 3 |
| 53 | 15.98 | 6.22 | 21.20 | 133.57 | 15.68 | 128.05 | ww | — | Menu | 30,000 Mile Dealer Upsell Menu, Part 5 |
| 54 | 14.84 | 7.24 | 21.08 | 177.54 | 14.54 | 171.00 | ww | — | Menu | 100,000 Mile Dealer Upsell Menu, Part 1 |
| 55 | 15.54 | 6.51 | 21.05 | 117.84 | 15.24 | 112.03 | ww | — | Craft | Lasting Impressions, Part 8 |
| 56 | 16.26 | 5.78 | 21.04 | 162.61 | 15.96 | 157.53 | ww | — | Menu | 20,000 Mile Dealer Upsell Menu, Part 3 |
| 57 | 14.96 | 7.06 | 21.02 | 169.64 | 14.66 | 163.28 | ww | — | Menu | 50,000 Mile Dealer Upsell Menu, Part 1 |
| 58 | 15.06 | 6.96 | 21.01 | 116.27 | 14.76 | 110.02 | ww | — | Menu | 35,000 Mile Dealer Upsell Menu, Part 1 |
| 59 | 16.58 | 5.30 | 20.88 | 205.07 | 16.28 | 200.47 | ww | — | Menu | 60,000 Mile Dealer Upsell Menu, Part 1 |
| 60 | 17.40 | 4.45 | 20.85 | 100.58 | 17.10 | 96.83 | ww | — | Craft | Get the Hell Out of Here, Part 1 |
| 61 | 14.64 | 7.04 | 20.68 | 128.10 | 14.34 | 121.76 | ww | — | Menu | 25,000 Mile Dealer Upsell Menu, Part 5 |
| 62 | 16.48 | 4.98 | 20.46 | 195.44 | 16.18 | 191.16 | ww | — | Menu | Diesel, Part 3 |
| 63 | 15.34 | 6.11 | 20.45 | 241.91 | 15.04 | 236.50 | ww | — | Menu | 85,000 Mile Dealer Upsell Menu, Part 1 |
| 64 | 15.42 | 5.99 | 20.41 | 158.24 | 15.12 | 152.95 | ww | — | Menu | 120,000 Mile Dealer Upsell Menu, Part 2 |
| 65 | 16.18 | 5.22 | 20.40 | 187.77 | 15.88 | 183.25 | ww | — | Menu | 150,000 Mile Dealer Upsell Menu, Part 3 |
| 66 | 15.64 | 5.61 | 20.25 | 212.81 | 15.34 | 207.90 | ww | — | Menu | 20,000 Mile Dealer Upsell Menu, Part 1 |
| 67 | 15.02 | 6.18 | 20.20 | 207.74 | 14.72 | 202.26 | ww | — | Menu | 45,000 Mile Dealer Upsell Menu, Part 3 |
| 68 | 15.52 | 5.65 | 20.16 | 245.78 | 15.22 | 240.83 | ww | — | Menu | EV Series, Part 3 |
| 69 | 14.94 | 6.15 | 20.09 | 108.87 | 14.64 | 103.42 | ww | — | Craft | Coverage is Key, Part 7 |
| 70 | 15.18 | 5.88 | 20.06 | 129.54 | 14.88 | 124.36 | ww | — | Menu | 30,000 Mile Dealer Upsell Menu, Part 4 |
| 71 | 14.78 | 6.09 | 19.87 | 159.94 | 14.48 | 154.55 | ww | — | Menu | Seasonal Menus, Part 3 |
| 72 | 15.20 | 5.59 | 19.79 | 130.41 | 14.90 | 125.52 | ww | — | Menu | 75,000 Mile Dealer Upsell Menu, Part 4 |
| 73 | 14.84 | 5.86 | 19.71 | 177.88 | 14.54 | 172.71 | ww | — | Menu | Seasonal Menus, Part 1 |
| 74 | 15.12 | 5.41 | 19.53 | 110.14 | 14.82 | 105.43 | ww | — | Menu | 120,000 Mile Dealer Upsell Menu, Part 3 |
| 75 | 13.56 | 6.94 | 19.50 | 112.94 | 13.26 | 106.70 | ww | — | Craft | Four Step Close, Part 8 |
| 76 | 15.42 | 5.06 | 19.49 | 229.38 | 15.12 | 225.01 | ww | — | Menu | Seasonal Menus, Part 5 |
| 77 | 14.68 | 5.72 | 19.40 | 108.74 | 14.38 | 103.72 | ww | — | Menu | 20,000 Mile Dealer Upsell Menu, Part 2 |
| 78 | 14.88 | 5.44 | 19.31 | 94.94 | 14.58 | 90.20 | ww | — | Menu | 20,000 Mile Dealer Upsell Menu, Part 4 |
| 79 | 12.90 | 7.02 | 18.92 | 143.10 | 12.60 | 136.78 | ww | — | Craft | 30 Second Walk-Around, Part 5, Step 4, Wheels to the Left |
| 80 | 14.50 | 5.38 | 18.88 | 222.14 | 14.20 | 217.46 | ww | — | Menu | EV Series, Part 2 |
| 81 | 13.66 | 6.19 | 18.85 | 118.84 | 13.36 | 113.35 | ww | — | Craft | Lasting Impressions, Part 3 |
| 82 | 19.08 | 2.21 | 18.78 | 179.41 | 18.78 | — | wc | — | Menu | 90,000 Mile Dealer Upsell Menu, Part 2 |
| 83 | 14.60 | 5.18 | 18.78 | 124.98 | 14.30 | 120.50 | ww | — | Craft | Get the Hell Out of Here, Part 3 |
| 84 | 18.90 | 0.31 | 18.60 | 222.77 | 18.60 | — | wc | — | Menu | 5,000/7,500 Mile Dealer Upsell Menu (2716) |
| 85 | 13.44 | 6.10 | 18.54 | 157.50 | 13.14 | 152.10 | ww | — | Menu | 25,000 Mile Dealer Upsell Menu, Part 2 |
| 86 | 13.80 | 5.61 | 18.41 | 81.57 | 13.50 | 76.66 | ww | — | Craft | Four Step Close, Part 1 |
| 87 | 14.26 | 5.11 | 18.38 | 101.41 | 13.96 | 96.99 | ww | — | Craft | Coverage is Key, Part 3 |
| 88 | 13.80 | 5.53 | 18.33 | 115.41 | 13.50 | 110.58 | ww | — | Menu | 60,000 Mile Dealer Upsell Menu, Part 3 |
| 89 | 14.28 | 4.91 | 18.19 | 115.10 | 13.98 | 110.89 | ww | — | Menu | Diesel, Part 1 |
| 90 | 13.74 | 5.37 | 18.11 | 91.23 | 13.44 | 86.57 | ww | — | Craft | Four Step Close, Part 6 |
| 91 | 13.86 | 5.15 | 18.02 | 156.41 | 13.56 | 151.95 | ww | — | Craft | 30 Second Walk-Around, Part 4, Step 3, Start It |
| 92 | 12.78 | 6.18 | 17.96 | 110.57 | 12.48 | 105.09 | ww | — | Craft | Lasting Impressions, Part 10 |
| 93 | 18.24 | — | 17.94 | 56.80 | 17.94 | — | wn | — | Menu | 70,000 Mile Dealer Upsell Menu, Part 2 (2821) |
| 94 | 13.68 | 5.14 | 17.83 | 130.71 | 13.38 | 126.26 | ww | — | Craft | Coverage is Key, Part 2 |
| 95 | 13.78 | 4.98 | 17.76 | 111.04 | 13.48 | 106.76 | ww | — | Craft | Get the Hell Out of Here, Part 8 |
| 96 | 13.02 | 5.74 | 17.76 | 102.27 | 12.72 | 97.23 | ww | — | Craft | Phones and Tones, Part 11 |
| 97 | 14.36 | 4.34 | 17.70 | 126.58 | 14.06 | 122.94 | ww | — | Craft | Get the Hell Out of Here, Part 5 |
| 98 | 12.48 | 6.13 | 17.61 | 121.44 | 12.18 | 116.01 | ww | — | Craft | 30 Second Walk-Around, Part 9, 42 seconds |
| 99 | 13.78 | 4.76 | 17.54 | 163.31 | 13.48 | 159.25 | ww | — | Menu | Diesel, Part 2 |
| 100 | 12.48 | 5.99 | 17.46 | 121.40 | 12.18 | 116.12 | ww | — | Craft | Lasting Impressions, Part 9 |
| 101 | 13.90 | 4.46 | 17.36 | 163.91 | 13.60 | 160.15 | ww | — | Menu | Seasonal Menus, Part 2 |
| 102 | 12.80 | 5.52 | 17.33 | 177.11 | 12.50 | 172.28 | ww | — | Craft | Name Tag, Part 7 |
| 103 | 13.02 | 5.28 | 17.30 | 101.38 | 12.72 | 96.80 | ww | — | Craft | Get the Hell Out of Here, Part 4 |
| 104 | 13.28 | 5.00 | 17.28 | 128.28 | 12.98 | 123.98 | ww | — | Craft | Name Tag, Part 4 |
| 105 | 12.90 | 5.36 | 17.26 | 95.57 | 12.60 | 90.91 | ww | — | Craft | Four Step Close, Part 3 |
| 106 | 12.76 | 5.46 | 17.23 | 122.58 | 12.46 | 117.81 | ww | — | Craft | CSI — The 2222 Follow-Up, Part 5 |
| 107 | 12.78 | 5.37 | 17.15 | 158.11 | 12.48 | 153.44 | ww | — | Craft | Name Tag, Part 10 |
| 108 | 11.54 | 6.58 | 17.13 | 86.31 | 11.24 | 80.42 | ww | — | Craft | Setting up the MPI — Closer |
| 109 | 11.18 | 6.95 | 17.12 | 96.50 | 10.88 | 90.26 | ww | — | Pitches by Op Code | MPI Setup |
| 110 | 12.46 | 5.56 | 17.02 | 133.74 | 12.16 | 128.88 | ww | — | Craft | Name Tag, Part 8 |
| 111 | 12.36 | 5.64 | 17.00 | 119.11 | 12.06 | 114.17 | ww | — | Craft | Lasting Impressions, Part 12 |
| 112 | 12.70 | 5.21 | 16.91 | 94.77 | 12.40 | 90.26 | ww | — | Craft | Four Step Close, Part 9 |
| 113 | 13.50 | 4.41 | 16.91 | 105.38 | 13.20 | 101.67 | ww | — | Craft | Get the Hell Out of Here, Part 6 |
| 114 | 12.80 | 5.07 | 16.87 | 173.18 | 12.50 | 168.81 | ww | — | Craft | Success Cycle, Part 6, More Staging |
| 115 | 12.38 | 5.49 | 16.86 | 122.41 | 12.08 | 117.62 | ww | — | Craft | Name Tag, Part 3 |
| 116 | 11.56 | 6.30 | 16.86 | 87.77 | 11.26 | 82.17 | ww | — | Craft | Phones and Tones, Part 8 |
| 117 | 12.18 | 5.66 | 16.84 | 86.44 | 11.88 | 81.48 | ww | — | Craft | Lasting Impressions — Closer |
| 118 | 11.64 | 6.09 | 16.73 | 169.68 | 11.34 | 164.29 | ww | — | Craft | Name Tag, Part 1 |
| 119 | 12.28 | 5.44 | 16.72 | 126.81 | 11.98 | 122.07 | ww | — | Craft | CSI — The 2 Week and 2 Month Follow-Ups, Part 6 |
| 120 | 12.00 | 5.71 | 16.72 | 77.23 | 11.70 | 72.22 | ww | — | Craft | Selling Skills, Part 8 |
| 121 | 11.76 | 5.89 | 16.66 | 145.08 | 11.46 | 139.88 | ww | — | Craft | CSI — Upon Arrival, Part 3 |
| 122 | 12.12 | 5.44 | 16.56 | 123.61 | 11.82 | 118.87 | ww | — | Craft | CSI — CSI Is Not a Score, Part 1 |
| 123 | 12.12 | 5.42 | 16.54 | 93.50 | 11.82 | 88.78 | ww | — | Craft | Phones and Tones, Part 5 |
| 124 | 13.16 | 4.36 | 16.52 | 140.01 | 12.86 | 136.35 | ww | — | Craft | Success Cycle, Part 8, Anticipate the No |
| 125 | 13.34 | 4.08 | 16.42 | 85.28 | 13.04 | 81.90 | ww | — | Craft | Get the Hell Out of Here, Part 2 |
| 126 | 11.86 | 5.54 | 16.40 | 163.84 | 11.56 | 159.00 | ww | — | Craft | Coverage is Key, Part 10 |
| 127 | 12.94 | 4.39 | 16.33 | 103.61 | 12.64 | 99.92 | ww | — | Craft | Get the Hell Out of Here, Part 9 |
| 128 | 16.60 | -0.03 | 16.30 | 236.91 | 16.30 | — | wc | — | Menu | 40,000 Mile Dealer Upsell Menu, Part 3 |
| 129 | 11.88 | 5.40 | 16.28 | 101.74 | 11.58 | 97.04 | ww | — | Craft | Coverage is Key, Part 9 |
| 130 | 16.56 | 3.15 | 16.26 | 121.87 | 16.26 | — | wc | — | Menu | 55,000 Mile Dealer Upsell Menu, Part 3 |
| 131 | 11.48 | 5.77 | 16.24 | 86.54 | 11.18 | 81.48 | ww | — | Craft | Name Tag — Closer |
| 132 | 12.98 | 4.23 | 16.21 | 166.77 | 12.68 | 163.24 | ww | — | Craft | 30 Second Walk-Around, Part 8, Step 6 and 7, Miles, Shut It Off and Tires |
| 133 | 11.48 | 5.69 | 16.17 | 83.33 | 11.18 | 78.34 | ww | — | Craft | Lasting Impressions, Part 4 |
| 134 | 10.70 | 6.37 | 16.07 | 126.37 | 10.40 | 120.70 | ww | — | Craft | 30 Second Walk-Around, Part 6, Step 5, Washer Fluid |
| 135 | 11.84 | 5.22 | 16.07 | 191.98 | 11.54 | 187.45 | ww | — | Craft | Name Tag, Part 5 |
| 136 | 12.90 | 4.16 | 16.05 | 166.34 | 12.60 | 162.89 | ww | — | Craft | Get the Hell Out of Here, Part 7 |
| 137 | 12.30 | 4.72 | 16.02 | 103.40 | 12.00 | 99.38 | ww | — | Pitches by Op Code | MPI Setup |
| 138 | 11.72 | 5.25 | 15.96 | 159.97 | 11.42 | 155.43 | ww | — | Craft | Menu Wrap-Up, Part 1 |
| 139 | 10.78 | 6.16 | 15.94 | 125.34 | 10.48 | 119.88 | ww | — | Craft | Coverage is Key, Part 5 |
| 140 | 11.46 | 5.48 | 15.93 | 105.00 | 11.16 | 100.23 | ww | — | Craft | Phones and Tones, Part 1 |
| 141 | 16.22 | 5.21 | 15.92 | 113.57 | 15.92 | — | wc | — | Menu | 15,000 Mile Dealer Upsell Menu, Part 4 |
| 142 | 16.22 | -0.79 | 15.92 | 193.61 | 15.92 | — | wc | — | Menu | Seasonal Menus, Part 4 |
| 143 | 11.18 | 5.74 | 15.91 | 196.14 | 10.88 | 191.11 | ww | — | Craft | Success Cycle, Part 9, More on Overcoming Objections |
| 144 | 11.02 | 5.89 | 15.91 | 90.57 | 10.72 | 85.38 | ww | — | Craft | Phones and Tones, Part 2 |
| 145 | 11.34 | 5.56 | 15.90 | 197.51 | 11.04 | 192.65 | ww | — | Craft | Success Cycle, Part 7, Features and Benefits |
| 146 | 12.08 | 4.75 | 15.83 | 139.71 | 11.78 | 135.66 | ww | — | Craft | Lasting Impressions, Part 11 |
| 147 | 10.96 | 5.79 | 15.75 | 256.84 | 10.66 | 251.75 | ww | — | Craft | Success Cycle, Part 3, More Vocabulary |
| 148 | 11.28 | 5.47 | 15.75 | 104.67 | 10.98 | 99.90 | ww | — | Craft | Selling Skills, The Steer Objection |
| 149 | 11.22 | 5.41 | 15.64 | 91.98 | 10.92 | 87.26 | ww | — | Craft | Selling Skills, Part 2 |
| 150 | 11.54 | 5.09 | 15.63 | 117.54 | 11.24 | 113.15 | ww | — | Craft | Selling Skills, Part 6 |
| 151 | 12.10 | 4.52 | 15.62 | 220.54 | 11.80 | 216.72 | ww | — | Craft | 30 Second Walk-Around, Part 1, Before You Go Outside |
| 152 | 11.12 | 5.48 | 15.60 | 127.11 | 10.82 | 122.33 | ww | — | Craft | Coverage is Key, Part 4 |
| 153 | 10.66 | 5.88 | 15.54 | 135.87 | 10.36 | 130.69 | ww | — | Pitches by Op Code | After-MPI |
| 154 | 15.84 | — | 15.54 | 128.21 | 15.54 | — | wn | — | Craft | Name Tag, Part 6 |
| 155 | 10.74 | 5.77 | 15.51 | 69.64 | 10.44 | 64.57 | ww | — | Craft | Phones and Tones — Closer |
| 156 | 10.48 | 6.01 | 15.49 | 95.08 | 10.18 | 89.77 | ww | — | Craft | Coverage is Key — Opener |
| 157 | 10.74 | 5.74 | 15.48 | 110.04 | 10.44 | 105.00 | ww | — | Craft | Selling Skills, Part 7 |
| 158 | 15.76 | 0.58 | 15.46 | 110.50 | 15.46 | — | wc | — | Menu | 55,000 Mile Dealer Upsell Menu, Part 2 |
| 159 | 10.96 | 5.50 | 15.46 | 128.04 | 10.66 | 123.24 | ww | — | Craft | 30 Second Walk-Around, Part 7, The Four Step Close |
| 160 | 11.56 | 4.86 | 15.41 | 93.10 | 11.26 | 88.95 | ww | — | Craft | Phones and Tones, Part 4 |
| 161 | 10.72 | 5.68 | 15.41 | 77.78 | 10.42 | 72.79 | ww | — | Craft | Coverage is Key — Closer |
| 162 | 10.16 | 6.24 | 15.40 | 108.37 | 9.86 | 102.83 | ww | — | Craft | Phones and Tones, Part 6 |
| 163 | 11.80 | 4.55 | 15.35 | 199.54 | 11.50 | 195.69 | ww | — | Craft | Success Cycle, Part 5, The 6 Stages |
| 164 | 10.78 | 5.54 | 15.32 | 84.07 | 10.48 | 79.23 | ww | — | Craft | Phones and Tones, Part 3 |
| 165 | 10.96 | 5.33 | 15.29 | 158.14 | 10.66 | 153.51 | ww | — | Craft | Phones and Tones, Part 9 |
| 166 | 11.60 | 4.64 | 15.25 | 166.38 | 11.30 | 162.43 | ww | — | Pitches by Op Code | After-MPI |
| 167 | 10.68 | 5.52 | 15.20 | 118.74 | 10.38 | 113.92 | ww | — | Craft | Name Tag, Part 2 |
| 168 | 10.64 | 5.53 | 15.17 | 130.47 | 10.34 | 125.64 | ww | — | Craft | Coverage is Key, Part 6 |
| 169 | 10.76 | 5.30 | 15.05 | 100.20 | 10.46 | 95.61 | ww | — | Craft | Coverage is Key, Part 1 |
| 170 | 10.68 | 5.34 | 15.02 | 154.00 | 10.38 | 149.36 | ww | — | Pitches by Op Code | After-MPI |
| 171 | 10.66 | 5.33 | 14.99 | 134.37 | 10.36 | 129.74 | ww | — | Craft | Phones and Tones, Part 10 |
| 172 | 11.20 | 4.76 | 14.96 | 107.24 | 10.90 | 103.18 | ww | — | Pitches by Op Code | Pre-Write |
| 173 | 10.64 | 5.29 | 14.94 | 105.91 | 10.34 | 101.31 | ww | — | Craft | Phones and Tones, Part 12 |
| 174 | 10.56 | 5.28 | 14.84 | 90.61 | 10.26 | 86.03 | ww | — | Craft | Name Tag — Opener |
| 175 | 10.12 | 5.71 | 14.83 | 85.64 | 9.82 | 80.63 | ww | — | Craft | Success Cycle — Closer |
| 176 | 10.50 | 5.32 | 14.82 | 95.94 | 10.20 | 91.32 | ww | — | Craft | Selling Skills, Part 9 |
| 177 | 10.94 | 4.83 | 14.77 | 195.74 | 10.64 | 191.61 | ww | — | Craft | Success Cycle, Part 2, Vocabulary That Sails |
| 178 | 15.00 | -0.58 | 14.70 | 170.04 | 14.70 | — | wc | — | Menu | Diesel, Part 4 |
| 179 | 9.64 | 5.90 | 14.53 | 178.91 | 9.34 | 173.71 | ww | — | Pitches by Op Code | On the Drive |
| 180 | 11.42 | 4.08 | 14.51 | 229.31 | 11.12 | 225.92 | ww | — | Craft | Success Cycle, Part 12, Your song, Go Sing It |
| 181 | 14.74 | — | 14.44 | 42.44 | 14.44 | — | wn | — | Menu | 25,000 Mile Dealer Upsell Menu (2748) |
| 182 | 10.24 | 5.15 | 14.40 | 140.41 | 9.94 | 135.95 | ww | — | Craft | Four Step Close, Part 10 |
| 183 | 9.48 | 5.86 | 14.35 | 81.28 | 9.18 | 76.11 | ww | — | Pitches by Op Code | MPI Setup |
| 184 | 10.44 | 4.91 | 14.34 | 75.23 | 10.14 | 71.03 | ww | — | Craft | Four Step Close, Part 2 |
| 185 | 14.62 | 4.85 | 14.32 | 137.17 | 14.32 | — | wc | — | Craft | 30 Second Walk-Around, Part 3, Steps 1 and 2, Are You Here to See Anyone |
| 186 | 9.64 | 5.66 | 14.30 | 78.10 | 9.34 | 73.14 | ww | — | Craft | Selling Skills, Part 4 |
| 187 | 10.18 | 5.00 | 14.18 | 151.71 | 9.88 | 147.41 | ww | — | Craft | Success Cycle, Part 4, Green Yellow Red |
| 188 | 9.14 | 5.96 | 14.10 | 137.17 | 8.84 | 131.91 | ww | — | Pitches by Op Code | On the Drive, Part 1 |
| 189 | 10.26 | 4.79 | 14.05 | 209.14 | 9.96 | 205.05 | ww | — | Craft | Success Cycle, Part 11, The Repair Call |
| 190 | 9.38 | 5.59 | 13.97 | 105.54 | 9.08 | 100.65 | ww | — | Craft | Success Cycle, Part 1, Not a Rut Team |
| 191 | 14.24 | 0.49 | 13.94 | 164.77 | 13.94 | — | wc | — | Craft | Name Tag, Part 9 |
| 192 | 9.68 | 5.08 | 13.76 | 191.74 | 9.38 | 187.36 | ww | — | Pitches by Op Code | Objections |
| 193 | 13.88 | 0.23 | 13.58 | 92.47 | 13.58 | — | wc | — | Menu | Diesel, Part 5 |
| 194 | 9.94 | 4.55 | 13.49 | 103.07 | 9.64 | 99.22 | ww | — | Craft | Phones and Tones, Part 7 |
| 195 | 13.50 | 0.31 | 13.20 | 203.71 | 13.20 | — | wc | — | Menu | Diesel, Part 6 |
| 196 | 7.98 | 6.10 | 13.08 | 97.81 | 7.68 | 92.41 | ww | — | Mindset | All for One and One for All Versus Every Man for Himself |
| 197 | 9.00 | 5.07 | 13.07 | 155.44 | 8.70 | 151.07 | ww | — | Pitches by Op Code | On the Drive |
| 198 | 13.00 | 5.53 | 12.70 | 79.97 | 12.70 | — | wc | — | Craft | Four Step Close, Part 4 |
| 199 | 8.96 | 4.59 | 12.56 | 158.47 | 8.66 | 154.57 | ww | — | Pitches by Op Code | At the Kiosk |
| 200 | 8.50 | 4.52 | 12.02 | 108.98 | 8.20 | 105.16 | ww | — | Pitches by Op Code | On the Drive, Part 2 |
| 201 | 12.04 | 0.62 | 11.74 | 87.70 | 11.74 | — | wc | — | Craft | Four Step Close, Part 5 |
| 202 | 11.88 | 0.36 | 11.58 | 117.41 | 11.58 | — | wc | — | Craft | Lasting Impressions, Part 5 |
| 203 | 11.30 | 5.48 | 11.00 | 127.48 | 11.00 | — | wc | — | Craft | CSI — Prior to Arrival, Part 2 |
| 204 | 10.24 | 1.66 | 9.94 | 119.94 | 9.94 | — | wc | — | Craft | Lasting Impressions, Part 2 |
| 205 | 9.92 | 0.06 | 9.62 | 111.34 | 9.62 | — | wc | — | Craft | Selling Skills, Part 1 |
| 206 | 0.00 | 7.18 | 6.48 | 71.28 | — | 64.80 | cw | — | Craft | Four Step Close — Closer |
| 207 | 0.00 | 6.99 | 6.29 | 187.34 | — | 181.05 | cw | — | Craft | Two Minute Walk-Around, Part 2, 4 things under the hood |
| 208 | 0.00 | 6.95 | 6.25 | 134.00 | — | 127.75 | cw | — | Onboarding | Welcome from Mitch |
| 209 | 10.00 | 6.89 | 6.19 | 146.04 | — | 139.85 | cw | — | Craft | Coverage is Key, Part 8 |
| 210 | 0.00 | 6.63 | 5.93 | 147.04 | — | 141.11 | cw | — | Craft | Lasting Impressions, Part 7 |
| 211 | 0.00 | 6.22 | 5.52 | 104.94 | — | 99.42 | cw | — | Craft | Four Step Close, Part 7 |
| 212 | 0.00 | 6.11 | 5.41 | 77.18 | — | 71.77 | cw | — | Craft | Menus — Closer |
| 213 | 5.62 | 0.80 | 5.32 | 79.80 | 5.32 | — | wc | — | Pitches by Op Code | MPI Setup |
| 214 | 0.55 | 5.92 | 5.22 | 162.04 | — | 156.82 | cw | yes | Craft | Dealer Upsell Menus and Interval Charts — Opener |
| 215 | 0.00 | 5.89 | 5.19 | 87.90 | — | 82.71 | cw | — | Pitches by Op Code | At the Kiosk |
| 216 | 0.00 | 5.82 | 5.12 | 52.98 | — | 47.86 | cw | — | Craft | Setting up the MPI — Opener |
| 217 | 0.00 | 5.70 | 4.99 | 68.74 | — | 63.75 | cw | — | Craft | Phones and Tones — Opener |
| 218 | 0.00 | 5.68 | 4.98 | 111.64 | — | 106.66 | cw | — | Craft | Lasting Impressions, Part 6 |
| 219 | 0.00 | 5.64 | 4.94 | 128.54 | — | 123.60 | cw | — | Craft | Lasting Impressions, Part 1 |
| 220 | 0.00 | 5.58 | 4.88 | 135.74 | — | 130.86 | cw | — | Craft | Success Cycle — Opener |
| 221 | 0.00 | 5.42 | 4.72 | 71.44 | — | 66.72 | cw | — | Craft | Lasting Impressions — Opener |
| 222 | 0.00 | 5.36 | 4.66 | 210.47 | — | 205.81 | cw | — | Craft | Menu Wrap-Up, Part 2 |
| 223 | 0.00 | 5.33 | 4.62 | 163.34 | — | 158.72 | cw | — | Pitches by Op Code | At the Kiosk |
| 224 | 0.00 | 5.32 | 4.62 | 103.28 | — | 98.66 | cw | — | Pitches by Op Code | After-MPI |
| 225 | 0.00 | 5.15 | 4.45 | 97.31 | — | 92.86 | cw | — | Pitches by Op Code | A Quote on Every Vehicle |
| 226 | 0.00 | 5.14 | 4.44 | 104.88 | — | 100.44 | cw | — | Craft | Selling Skills, Part 3 |
| 227 | 0.00 | 5.02 | 4.32 | 108.68 | — | 104.36 | cw | — | Craft | CSI — Upon Departure, Part 4 |
| 228 | 0.00 | 4.96 | 4.27 | 110.38 | — | 106.11 | cw | — | Mindset | Success Is a Choice |
| 229 | 0.00 | 4.93 | 4.22 | 88.14 | — | 83.92 | cw | — | Mindset | Tomorrow Me vs. Today Me |
| 230 | 0.00 | 4.91 | 4.20 | 100.60 | — | 96.40 | cw | — | Craft | Selling Skills, Part 10 |
| 231 | 0.00 | 4.84 | 4.14 | 224.81 | — | 220.67 | cw | — | Pitches by Op Code | Objections |
| 232 | — | 4.83 | 4.14 | 101.11 | — | 96.97 | nw | — | Pitches by Op Code | MPI Setup |
| 233 | 0.00 | 4.73 | 4.03 | 145.67 | — | 141.64 | cw | — | Craft | 30 Second Walk-Around, Part 2, Four Goals, Two Words |
| 234 | 0.00 | 4.70 | 4.00 | 93.68 | — | 89.68 | cw | — | Craft | Four Step Close — Opener |
| 235 | — | 4.57 | 3.88 | 221.41 | — | 217.53 | nw | — | Craft | Success Cycle, Part 10, Anatomy of the Speech |
| 236 | 0.00 | 4.48 | 3.78 | 154.47 | — | 150.69 | cw | — | Craft | Two Minute Walk-Around, Part 1, Pop the Hood |
| 237 | 0.00 | 4.43 | 3.73 | 97.08 | — | 93.34 | cw | yes | Pitches by Op Code | MPI Setup |
| 238 | 0.00 | 4.02 | 3.32 | 78.95 | — | 75.63 | cw | yes | Mindset | The Man in the Glass |
| 239 | 0.00 | 3.04 | 2.34 | 181.06 | — | 178.72 | ww | yes | Pitches by Op Code | Piggyback |
| 240 | 0.00 | 2.23 | 1.53 | 60.69 | — | 59.16 | cw | yes | Mindset | Wall Street |
| 241 | 0.00 | 1.95 | 1.25 | 41.55 | — | 40.30 | cw | yes | Mindset | Everybody, Anybody, Somebody and Nobody |
| 242 | 0.00 | 1.94 | 1.23 | 153.30 | — | 152.07 | cw | yes | Pitches by Op Code | After-MPI |
| 243 | 0.55 | 1.91 | 1.20 | 169.18 | — | 167.98 | cw | yes | Pitches by Op Code | At the Kiosk |
| 244 | 0.00 | 1.80 | 1.10 | 108.56 | — | 107.46 | cw | yes | Mindset | The Most Dangerous Person |
| 245 | 0.00 | 1.80 | 1.09 | 27.20 | — | 26.11 | cw | yes | Mindset | 20 Years to Build a Reputation |
| 246 | 1.38 | 0.61 | 1.08 | 209.61 | 1.08 | — | wc | — | Pitches by Op Code | At the Kiosk |
| 247 | 0.00 | 1.74 | 1.05 | 203.91 | — | 202.86 | cw | yes | Craft | The OE Approach — Severe Conditions |
| 248 | 0.00 | 1.69 | 1.00 | 27.09 | — | 26.09 | cw | yes | Mindset | Never Lose Money |
| 249 | 0.27 | 1.67 | 0.98 | 150.37 | — | 149.39 | cw | yes | Pitches by Op Code | MPI Setup |
| 250 | 0.00 | 1.67 | 0.97 | 153.64 | — | 152.67 | cw | yes | Craft | The OE Approach — Lifetime Fluid |
| 251 | 0.00 | 1.63 | 0.93 | 254.47 | — | 253.54 | cw | yes | Craft | The OE Stagger — The Order and Why |
| 252 | 0.00 | 1.62 | 0.92 | 31.34 | — | 30.42 | cw | yes | Mindset | Your Toughest Opponent Is Staring at You |
| 253 | 0.00 | 1.61 | 0.92 | 41.61 | — | 40.69 | cw | yes | Mindset | Did I Get Better Today? |
| 254 | 0.00 | 1.51 | 0.81 | 168.16 | — | 167.35 | cw | yes | Craft | The OE Approach — The Maintenance Menu |

## For Ryan to rule on — nothing proposed for these

### On the Drive, Part 1

`2dfb0041-137c-406d-a108-cab3e65f5fc9` · Pitches by Op Code · 124.62s · head 0.15 · tail — · **no-signoff**

- closes: *are two different belts and check history. That's a second question that can save an engine. On the drive, part two is coming up next. That's where we talk about what's actually at stake with these belts and chains. Follow.*

### Compare Yourself to Yesterday

`4bb67043-850a-471f-8b3c-982f1dd7f581` · Mindset · 113.13s · head 0.00 · tail 5.29 · **offset-suspect(captions 107.84 vs words 112.04)**

- opens: *Aloha! Compare yourself to who you were yesterday. That's rule number four of Jordan Peterson's 12 Rules for Life. There is only one person in the world that wants it more than me today, and that's me tomorrow. Compare yourself*
- closes: *your own unique personal journey. And then finally, why it matters. The perspective is inherently hopeful, as it is always possible to make some small improvement in your life every single day, leading to significant positive change over time. Mahalo.*

### Work Hard in the Dark, Shine in the Light

`51e9507b-092b-40a5-ba65-4fe8c5ce3f3f` · Mindset · 27.00s · head 0.00 · tail 6.22 · **offset-suspect(captions 20.78 vs words 25.82)**

- opens: *Aloha, you have to work hard in the dark to shine in the light by Kobe Bryant. Full quote, you have to work hard in the dark to shine in the light. No lights, no customers, just you. It is*
- closes: *you. It is in your early morning routine. It happens in the product knowledge studied at home. It's going over your word tracks with your kids on the way to school. It's the stuff nobody sees except you. Mahalo. Mahalo.*

### Successful vs. Really Successful

`9ce47ebc-86f9-4ac6-a1c6-c44d537f49d9` · Mindset · 25.84s · head 0.00 · tail 5.96 · **offset-suspect(captions 19.88 vs words 25.18)**

- opens: *Aloha! The difference between successful people and really successful people is that really successful people say no to almost everything. That's a quote by Warren Buffett. And the thing is customers know this so get ready for the no. Seek*
- closes: *That's a quote by Warren Buffett. And the thing is customers know this so get ready for the no. Seek the no. Track why folks say no. You learn much more from a no than you do a yes. Mahalo!*

### Buffalos and the Cows

`9fd634f3-82af-4e04-a250-a9ed85fec4bb` · Mindset · 95.73s · head 0.00 · tail 6.25 · **tail-unmeasured(captions put a Mahalo ending at 89.48s)**

- opens: *Aloha, this comes from a book called, Take the Stairs by Rory Vaden. He grew up in Colorado and being here in the CO, I can share with you, storms build over those rocky mountains and they roll east and*
- closes: *doesn't get ready on time, the tech that found more than the number that was discussed. Cows make that call at 4 .30. Buffaloes make it at 10. Same conversation, six hours longer in the rain. Every day is a*
- error: `tail: captions located a sign-off the word pass did not`

### Diversification & Ignorance

`c420f15a-e640-4283-9054-47da0ff20b87` · Mindset · 33.79s · head — · tail 0.49 · **no-greeting**

- opens: *Diversification is a protection against ignorance. That's a quote by Warren Buffett. Short and sweet, like me. I love simple quotes that mean different things to different folks. Mr. Buffett is talking about investments, but as an advisor, this is*

## Measured fine, and therefore not in the apply run

187 films. Head and tail both inside the thresholds.

| head | tail | dur | by | collection | title |
|---:|---:|---:|:--|:--|---|
| 0.95 | 0.92 | 170.25 | cc | Pitches by Op Code | After-MPI |
| 0.61 | 1.18 | 122.95 | cc | Pitches by Op Code | After-MPI |
| 0.23 | 1.44 | 180.31 | cc | Pitches by Op Code | After-MPI |
| 0.37 | 1.18 | 185.83 | cc | Pitches by Op Code | On the Drive |
| 0.00 | 1.48 | 79.25 | cc | Mindset | The More Things You Give |
| 0.00 | 1.46 | 197.97 | cw | Pitches by Op Code | After-MPI, Part 1 |
| 0.00 | 1.44 | 62.95 | wc | Pitches by Op Code | At the Kiosk |
| 0.67 | 0.76 | 79.63 | cc | Mindset | Ideas, Events, People |
| 0.31 | 1.12 | 86.77 | cc | Mindset | Every Step of the Road |
| 0.51 | 0.89 | 184.60 | cc | Pitches by Op Code | Objections |
| 0.00 | 1.40 | 67.48 | cc | Mindset | Four Things You Can't Get Back |
| 0.00 | 1.35 | 307.31 | cc | Pitches by Op Code | At the Kiosk |
| 0.00 | 1.33 | 120.94 | cc | Mindset | Promise Yourself |
| 0.00 | 1.32 | 121.67 | cc | Pitches by Op Code | At the Kiosk, Part 2 |
| 0.00 | 1.31 | 41.93 | cc | Mindset | Print Money, Not Time |
| 0.00 | 1.30 | 69.66 | cc | Mindset | Mediocre People Don't Like High Achievers |
| 0.53 | 0.77 | 88.18 | cc | Pitches by Op Code | On the Drive, Part 1 |
| 0.00 | 1.28 | 308.04 | cc | Pitches by Op Code | On the Drive |
| 0.00 | 1.28 | 25.72 | cc | Mindset | Get Better |
| 0.00 | 1.27 | 84.10 | cc | Mindset | You'll Never Feel Ready |
| 0.00 | 1.26 | 45.18 | cc | Mindset | The Money Mindset |
| 0.00 | 1.26 | 240.67 | cc | Craft | Strawberry Lemonade |
| 0.00 | 1.26 | 79.26 | cc | Mindset | Four Things You Can Stop Doing |
| 0.00 | 1.25 | 248.47 | cc | Pitches by Op Code | On the Drive |
| 0.00 | 1.24 | 59.97 | cc | Mindset | Greatness Is Inside |
| 0.00 | 1.24 | 88.85 | cc | Craft | The Big Ticket Visit, Part 3 |
| 0.00 | 1.24 | 158.03 | cc | Pitches by Op Code | On the Drive, Part 2 |
| 0.31 | 0.91 | 298.56 | cc | Craft | The Four Minute Walk-Around, Part 3 |
| 0.43 | 0.78 | 74.29 | cc | Mindset | The Four F's |
| 0.00 | 1.20 | 54.73 | cc | Mindset | More Life |
| 0.00 | 1.20 | 223.47 | cc | Pitches by Op Code | On the Drive |
| 0.00 | 1.19 | 237.28 | cc | Pitches by Op Code | After-MPI |
| 0.00 | 1.18 | 50.10 | cc | Mindset | Don't Quit, Someone Needs Who You're Becoming |
| 0.00 | 1.15 | 44.87 | cc | Mindset | Perish Attempting the Great and Impossible |
| 0.00 | 1.14 | 164.13 | cc | Craft | Overcoming Objections, Part 2 — How to Take a No |
| 0.21 | 0.93 | 80.18 | cc | Mindset | It Couldn't Be Done |
| 0.00 | 1.14 | 222.76 | cc | Pitches by Op Code | After-MPI |
| 0.31 | 0.82 | 110.37 | cc | Pitches by Op Code | On the Drive |
| 0.00 | 1.11 | 23.53 | cc | Mindset | I Do It Anyways |
| 0.00 | 1.11 | 46.91 | cc | Mindset | Lazy People vs. Winners |
| 0.00 | 1.11 | 174.12 | cc | Craft | The OE Approach — Use the Chart |
| 0.00 | 1.10 | 328.74 | cc | Pitches by Op Code | On the Drive |
| 0.53 | 0.57 | 179.10 | cc | Pitches by Op Code | Piggyback |
| 0.00 | 1.10 | 66.74 | cc | Pitches by Op Code | MPI Setup |
| 0.00 | 1.08 | 29.80 | cc | Mindset | You Fight Great, But I'm a Great Fighter |
| 0.00 | 1.08 | 56.36 | cc | Mindset | Hard Worker vs. Working Hard |
| 0.00 | 1.07 | 64.39 | cc | Mindset | Nick Saban's 3 Rules |
| 0.00 | 1.06 | 108.91 | cc | Pitches by Op Code | MPI Setup |
| 0.35 | 0.71 | 118.12 | cc | Pitches by Op Code | MPI Setup |
| 0.00 | 1.06 | 143.34 | cc | Pitches by Op Code | MPI Setup |
| 0.00 | 1.06 | 32.58 | cc | Mindset | Happy Kid, Happier Manager |
| 0.00 | 1.05 | 70.37 | cc | Pitches by Op Code | At the Kiosk |
| 0.00 | 1.05 | 205.56 | cc | Pitches by Op Code | After-MPI |
| 0.00 | 1.04 | 33.43 | ww | Mindset | Build the Habits You Admire |
| 0.00 | 1.04 | 61.40 | cc | Mindset | I Looked in Your Cup |
| 0.00 | 1.03 | 95.27 | cc | Mindset | You Are Not Tired |
| 0.00 | 1.03 | 83.42 | cc | Mindset | Results Happen Over Time |
| 0.00 | 1.03 | 203.82 | cc | Craft | Overcoming Objections, Part 1 |
| 0.00 | 1.02 | 34.14 | cc | Mindset | Owning Portions of Businesses |
| 0.00 | 1.02 | 61.18 | cc | Mindset | Carpe Diem |
| 0.00 | 1.02 | 39.18 | cc | Mindset | The Mamba Mentality |
| 0.00 | 1.00 | 85.73 | cc | Mindset | If You Have to Ask |
| 0.00 | 1.00 | 132.99 | cc | Pitches by Op Code | On the Drive, Part 2 |
| 0.01 | 0.98 | 309.41 | cc | Craft | The Four Minute Walk-Around, Part 2 |
| 0.00 | 0.99 | 90.91 | cc | Mindset | Have Patience with Yourself |
| 0.00 | 0.98 | 136.03 | cc | Pitches by Op Code | Piggyback |
| 0.00 | 0.98 | 156.94 | cc | Pitches by Op Code | After-MPI |
| 0.00 | 0.98 | 72.31 | cc | Mindset | The Wolf Climbing the Hill |
| 0.00 | 0.97 | 244.57 | cc | Pitches by Op Code | On the Drive |
| 0.00 | 0.97 | 126.58 | cc | Mindset | 99% of People |
| 0.00 | 0.96 | 118.99 | cc | Pitches by Op Code | At the Kiosk |
| 0.00 | 0.96 | 249.15 | cc | Pitches by Op Code | Objections |
| 0.00 | 0.95 | 267.27 | cc | Pitches by Op Code | At the Kiosk |
| 0.00 | 0.94 | 92.80 | cc | Mindset | The Invoice |
| 0.00 | 0.94 | 273.34 | cc | Pitches by Op Code | At the Kiosk |
| 0.00 | 0.94 | 216.41 | cc | Pitches by Op Code | On the Drive |
| 0.00 | 0.94 | 181.87 | cc | Pitches by Op Code | MPI Setup |
| 0.00 | 0.93 | 318.81 | cc | Pitches by Op Code | After-MPI |
| 0.13 | 0.80 | 184.97 | cc | Craft | The OE Stagger — Running It |
| 0.00 | 0.93 | 42.69 | cc | Mindset | Hang With People Better Than You |
| 0.55 | 0.37 | 208.14 | cc | Pitches by Op Code | At the Kiosk |
| 0.00 | 0.92 | 314.48 | cc | Pitches by Op Code | At the Kiosk |
| 0.00 | 0.91 | 36.91 | cc | Mindset | Where Are You Living? |
| 0.00 | 0.91 | 134.31 | cc | Pitches by Op Code | MPI Setup |
| 0.00 | 0.89 | 169.81 | cc | Pitches by Op Code | After-MPI |
| 0.00 | 0.88 | 227.94 | cc | Pitches by Op Code | After-MPI |
| 0.00 | 0.87 | 182.40 | cc | Pitches by Op Code | On the Drive, Part 3 |
| 0.00 | 0.87 | 45.03 | cc | Mindset | Every Day Is a Great Day to Be Mitch |
| 0.00 | 0.87 | 216.47 | cc | Pitches by Op Code | On the Drive |
| 0.00 | 0.87 | 307.71 | cc | Pitches by Op Code | After-MPI |
| 0.00 | 0.85 | 73.31 | cc | Mindset | The Will to Win |
| 0.00 | 0.85 | 99.30 | cw | Mindset | Read It Backwards |
| 0.00 | 0.84 | 244.74 | cc | Pitches by Op Code | At the Kiosk |
| 0.00 | 0.84 | 32.72 | cc | Mindset | Amateur vs. Professional |
| 0.00 | 0.83 | 36.51 | cc | Mindset | Doubt Is a Strange Thing |
| 0.00 | 0.81 | 154.98 | cc | Pitches by Op Code | At the Kiosk |
| 0.00 | 0.81 | 212.11 | cc | Pitches by Op Code | After-MPI |
| 0.00 | 0.81 | 35.13 | cc | Mindset | Always Keep Going |
| 0.00 | 0.80 | 63.98 | cc | Mindset | Decide What to Do With the Time Given |
| 0.00 | 0.80 | 125.48 | cc | Mindset | Stay in a Great Mood |
| 0.00 | 0.78 | 51.43 | wc | Mindset | Don't Tell Me You Can't |
| 0.00 | 0.77 | 52.63 | cc | Mindset | WIN: What's Important Now |
| 0.19 | 0.57 | 167.76 | cc | Pitches by Op Code | After-MPI, Part 2 |
| 0.00 | 0.75 | 38.79 | cc | Mindset | Demand Excellence |
| 0.00 | 0.74 | 80.03 | wc | Mindset | I'd Rather Be Tired Than Wondering |
| 0.11 | 0.63 | 105.14 | cc | Pitches by Op Code | MPI Setup |
| 0.00 | 0.74 | 42.90 | cc | Mindset | Day One or One Day |
| 0.00 | 0.72 | 105.30 | cc | Pitches by Op Code | MPI Setup |
| 0.00 | 0.72 | 212.43 | cc | Craft | The Four Minute Walk-Around, Part 1 |
| 0.00 | 0.71 | 60.24 | cc | Mindset | If Your Life Was a Movie |
| 0.00 | 0.71 | 33.71 | cc | Mindset | This Too Shall Pass |
| 0.00 | 0.71 | 180.26 | cc | Pitches by Op Code | Objections |
| 0.00 | 0.70 | 77.59 | cc | Mindset | A Tree Grows in Two Directions |
| 0.00 | 0.70 | 43.61 | cc | Mindset | Consistency Doesn't Guarantee Success |
| 0.00 | 0.69 | 50.09 | cc | Mindset | Choices |
| 0.00 | 0.68 | 211.04 | cc | Pitches by Op Code | After-MPI |
| 0.00 | 0.68 | 261.38 | cc | Pitches by Op Code | On the Drive |
| 0.00 | 0.67 | 152.84 | cc | Pitches by Op Code | After-MPI |
| 0.00 | 0.67 | 70.60 | wc | Mindset | Brave Enough |
| 0.00 | 0.66 | 135.51 | cc | Pitches by Op Code | On the Drive, Part 1 |
| 0.00 | 0.65 | 97.93 | cc | Mindset | Planted, Not Buried |
| 0.00 | 0.64 | 46.04 | cc | Mindset | Today Is the Tomorrow You Were Worried About |
| 0.00 | 0.63 | 62.67 | cc | Mindset | You Don't Lose When You Get Knocked Down |
| 0.00 | 0.63 | 52.79 | cc | Mindset | Three Things in a Teammate, Dependable, Skilled, Selfless |
| 0.00 | 0.62 | 136.94 | cc | Pitches by Op Code | MPI Setup |
| 0.00 | 0.61 | 113.36 | cc | Mindset | Discipline, Addictive Discipline, Obsession |
| 0.00 | 0.61 | 178.97 | cc | Pitches by Op Code | After-MPI |
| 0.00 | 0.61 | 221.91 | cc | Pitches by Op Code | At the Kiosk |
| 0.00 | 0.59 | 42.75 | cc | Mindset | The Biggest Mistake in Life |
| 0.00 | 0.58 | 85.09 | cc | Pitches by Op Code | After-MPI, Part 1 |
| 0.00 | 0.56 | 264.44 | cc | Pitches by Op Code | MPI Setup |
| 0.00 | 0.55 | 92.71 | cc | Mindset | Be the Reason Someone Believes |
| 0.00 | 0.55 | 80.74 | cc | Mindset | If You Want Average |
| 0.00 | 0.55 | 36.91 | cc | Mindset | Solving Difficult Problems |
| 0.00 | 0.54 | 303.18 | cc | Craft | Pre-Write |
| 0.00 | 0.52 | 63.56 | cc | Mindset | The One Thing You Can Control Every Day Is Your Attitude |
| 0.00 | 0.52 | 31.24 | cc | Mindset | Start Today |
| 0.00 | 0.51 | 249.51 | cc | Craft | The Big Ticket Visit |
| 0.00 | 0.47 | 123.26 | cc | Pitches by Op Code | Objections |
| 0.00 | 0.47 | 93.50 | cc | Pitches by Op Code | At the Kiosk |
| 0.00 | 0.46 | 30.20 | cc | Mindset | Fearful When Others Are Greedy |
| 0.00 | 0.44 | 157.94 | cc | Pitches by Op Code | MPI Setup |
| 0.00 | 0.37 | 184.98 | cc | Pitches by Op Code | Objections |
| 0.00 | 0.37 | 156.12 | cc | Pitches by Op Code | Objections |
| 0.13 | 0.23 | 81.36 | cc | Mindset | The Haves |
| 0.00 | 0.27 | 287.31 | cc | Pitches by Op Code | At the Kiosk |
| 0.00 | 0.25 | 39.93 | cc | Mindset | The Lowest Point Is the Doorway |
| 0.00 | 0.25 | 138.86 | cc | Craft | The Big Ticket Visit, Part 2 |
| 0.00 | 0.25 | 72.34 | cc | Craft | Sing It |
| 0.00 | 0.25 | 68.49 | cc | Mindset | Perfect Practice Makes Perfect |
| 0.00 | 0.24 | 224.24 | cc | Pitches by Op Code | On the Drive |
| 0.00 | 0.24 | 96.93 | wc | Mindset | Problems or Solutions |
| 0.00 | 0.24 | 46.88 | cc | Mindset | Create the Life You Can't Wait to Wake Up To |
| 0.00 | 0.22 | 313.94 | cc | Pitches by Op Code | On the Drive |
| 0.00 | 0.22 | 167.75 | cc | Craft | The OE Stagger — Why We Spread Them Out |
| 0.00 | 0.22 | 69.02 | cc | Mindset | The Moment You Feel Comfortable |
| 0.00 | 0.20 | 99.41 | cc | Pitches by Op Code | MPI Setup |
| 0.00 | 0.20 | 191.89 | cc | Pitches by Op Code | At the Kiosk |
| 0.00 | 0.19 | 164.16 | cc | Craft | The Big Ticket Visit, Part 1 |
| 0.00 | 0.19 | 68.11 | cc | Mindset | Confidence |
| 0.00 | 0.19 | 114.87 | cc | Pitches by Op Code | On the Drive, Part 1 |
| 0.00 | 0.18 | 238.44 | cc | Pitches by Op Code | On the Drive |
| 0.00 | 0.17 | 95.90 | cc | Mindset | Language of Gratitude |
| 0.00 | 0.17 | 319.61 | cc | Pitches by Op Code | On the Drive |
| 0.00 | 0.11 | 274.91 | cc | Pitches by Op Code | On the Drive |
| 0.00 | 0.09 | 191.61 | cc | Pitches by Op Code | At the Kiosk |
| 0.00 | 0.04 | 233.61 | ww | Pitches by Op Code | On the Drive |
| 0.00 | -0.06 | 211.94 | cc | Pitches by Op Code | After-MPI |
| 0.00 | -0.06 | 133.73 | cc | Pitches by Op Code | At the Kiosk, Part 1 |
| 0.21 | -0.36 | 173.85 | cc | Pitches by Op Code | On the Drive, Part 1 |
| 0.00 | -0.31 | 125.00 | cc | Pitches by Op Code | On the Drive, Part 2 |
| 0.00 | -0.56 | 119.95 | cc | Pitches by Op Code | At the Kiosk |
| 0.00 | -0.57 | 181.84 | cc | Pitches by Op Code | On the Drive, Part 2 |
| 0.00 | -0.61 | 41.46 | cc | Mindset | Be Better Than That |
| 0.00 | -0.76 | 151.01 | cc | Pitches by Op Code | MPI Setup |
| 0.00 | -0.84 | 295.04 | cc | Pitches by Op Code | Part 2 |
| 0.00 | -0.92 | 145.49 | cc | Pitches by Op Code | After-MPI, Part 2 |
| 0.00 | -0.97 | 94.44 | cc | Pitches by Op Code | MPI Setup |
| 0.00 | -1.00 | 334.14 | cc | Pitches by Op Code | On the Drive |
| 0.00 | -1.05 | 171.47 | cc | Craft | Wrap-Up |
| 0.00 | -1.06 | 317.78 | cc | Pitches by Op Code | At the Kiosk |
| 0.00 | -1.07 | 67.75 | cc | Mindset | Practice Makes Improvement |
| 0.00 | -1.08 | 55.47 | cc | Craft | You Cannot Lose — unattributed |
| 0.00 | -1.11 | 298.41 | cc | Pitches by Op Code | On the Drive |
| 0.00 | -1.16 | 141.00 | cc | Pitches by Op Code | MPI Setup |
| 0.00 | -1.36 | 153.47 | cc | Pitches by Op Code | At the Kiosk |
| 0.00 | -1.41 | 60.97 | cc | Mindset | One Focus |

*`by` reads head-then-tail: `w` word-level, `c` caption, `n` neither. No cut is proposed from a caption measurement alone.*

