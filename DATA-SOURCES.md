# Where the data come from

plew-map itself ships no corpora. The three drop-in folders in this repo were built from public archives. Use those folders to plot; go to the sources below to cite, re-download, or get more files.

Drop one unzipped folder onto plew-map. Do not drop `doreco africa/` (the full tree is huge).

GitHub ships the app only. AlpiLinK and DoReCo mini drop-ins: https://github.com/fsame/plew-map/releases/tag/datasets-1.0

ALLSSTAR wavs are not on GitHub. Get those from SpeechBox.

## AlpiLinK

Spoken Alpine varieties in Italy (Germanic, Romance, Slavic), crowdsourced 2023–2025.

- Project: https://alpilink.it/
- Corpus 1.2.1 on Zenodo: https://doi.org/10.5281/zenodo.15524879
- Licence: [CC BY-NC-SA 4.0](https://creativecommons.org/licenses/by-nc-sa/4.0/)
- Contact: vinko@ateneo.univr.it

**Local drop-in** (gitignored): `alpilink/alpilink-I01-bundle/`. Or download `alpilink-I01-bundle.zip` from the [release](https://github.com/fsame/plew-map/releases/tag/datasets-1.0).

The Zenodo dump is the full questionnaire and all tasks. The bundle is a small slice for the map.

## DoReCo Africa

Time-aligned documentation recordings from [DoReCo 2.0](https://doreco.huma-num.fr/). Annotations and (most) audio are on [Nakala](https://nakala.fr/); each language has its own DOI in `doreco africa/doreco_languages_metadata_africa.csv`.

Corpus citation: Seifart, Paschen & Stave (eds.). 2024. Language Documentation Reference Corpus (DoReCo) 2.0. https://doi.org/10.34847/nkl.7cbfq779

**Local drop-in** (gitignored): `doreco africa mini/`. Or download `doreco-africa-mini.zip` from the [release](https://github.com/fsame/plew-map/releases/tag/datasets-1.0).

Goemai and Tabaq (Karko) have no Nakala wavs. Get those from the source archives:

- Goemai (TLA): https://hdl.handle.net/1839/00-0000-0000-0000-6B5E-B
- Tabaq (ELAR): http://hdl.handle.net/2196/00-0000-0000-0002-2EAA-F

To rebuild the full Africa set from Nakala, run `doreco africa/download_africa.py`.

## ALLSSTAR (world Englishes)

L1 and L2 readings of *The North Wind and the Sun*, from Northwestern SpeechBox.

- Recordings: https://speechbox.linguistics.northwestern.edu/ALLSSTARcentral/#!/recordings
- File-name codes: [ALLSSTAR overview (PDF)](https://speechbox.linguistics.northwestern.edu/assets/allsstar/ALLSSTAR-Quick-Overview.pdf)
- Cite: Bradlow, A. R. ALLSSTAR: Archive of L1 and L2 Scripted and Spontaneous Transcripts And Recordings. https://speechbox.linguistics.northwestern.edu/#!/?goto=allsstar

**Local drop-in** (gitignored): `englishes_of_the_world/plew_world_englishes/`. Not on GitHub Releases; download NWS from SpeechBox.

Speaker ID, sex, and language are taken from the filenames. Map coordinates are conventional L1 homelands, not SpeechBox talker metadata. SpeechBox has a separate talker-info download if you need hometowns or proficiency.

## Built-in demos

The **Demo: atlas map** and **Demo: TOEIC scatter** buttons in the app do not download anything. They generate a background and a few points in the browser.
