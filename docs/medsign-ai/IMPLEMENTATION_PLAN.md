# MedSign AI: Python Implementation Plan

Source: *MedSign AI: An AI-Powered Tablet-Based Bidirectional Communication System for Deaf Patients at Nizwa Hospital* (TRC URG proposal, v3).

This plan turns the proposal into a buildable system with Python as the main language. It keeps the proposal's dual-channel design and its 40-week timeline, and it notes where the proposal's technical claims need adjusting before code is written.

---

## 1. What we are building

| Channel | Direction | What happens | Main tech |
|---|---|---|---|
| **A** | Doctor → Patient | Doctor speaks or types Arabic/English. The text becomes ArSL glosses, and the patient tablet plays them as signed video (MVP) or a 3D avatar (stretch). Unknown words fall back to fingerspelling plus a text overlay. | Whisper ASR, text→gloss translation, sign playback |
| **B** | Patient → Doctor | No camera. The patient taps through (1) a branching ArSL symptom Q&A with a body map and pain scale, (2) an ArSL sign keyboard with 300+ signs, (3) quick-reply macros. The doctor sees Arabic text and hears TTS for macros. | Decision-tree engine, gloss→Arabic generation, context-aware sign ranking |

Supporting parts: a clinical content portal (questions, signs, videos), a session backend shared by doctor and patient devices, and the research data pipeline (SUS, SCCS, CEI, outcomes).

---

## 2. Decisions that differ from the proposal (please confirm)

The proposal lists React Native, Node.js and a Unity "Signing Avatar SDK". Moving to Python and checking feasibility changes these points:

1. **Backend: FastAPI (Python) instead of Node.js.** The AI models (Whisper, AraBERT/AraT5, ranking) are Python, so one language covers the API and the models.
2. **Tablet clients: a Progressive Web App (PWA) instead of React Native.** The avatar is WebGL anyway, a PWA runs on iPad and Android without app-store approval, and it can cache all sign videos for offline use. The UI layer still needs a small amount of TypeScript; everything else is Python. If an all-Python UI is required, **Flet** (Python on Flutter) can build Android/iOS apps, but 3D body maps and avatar rendering are much weaker there.
3. **Channel A MVP uses recorded human sign clips, not a 3D avatar.** The project already films 300+ interpreter clips (Phase 5). Playing gloss sequences as stitched clips is reliable and easy to understand. The 3D avatar becomes a stretch goal: extract poses from the same clips with MediaPipe Holistic and retarget them to a glTF avatar in three.js. No off-the-shelf "Signing Avatar SDK" for ArSL is publicly available, so this should not sit on the critical path.
4. **AraBERT alone cannot do sequence-to-sequence translation.** It is an encoder only. Use **AraT5** (or a BERT2BERT model warm-started from AraBERT) for text→gloss. No public Arabic→ArSL gloss corpus exists, so the translator is a **hybrid**:
   - an exact/fuzzy match against a library of pre-translated clinical phrases (covers most ENT doctor utterances),
   - a rule-based lemmatise-and-lookup pipeline (CAMeL Tools) against the ENT sign dictionary,
   - a fine-tuned AraT5 model trained on a small parallel corpus that the interpreter annotates during Phases 2 and 5 (about 1,500–3,000 sentence pairs), used only when the first two miss,
   - fingerspelling plus a text overlay for anything left over.
5. **Latency target.** "< 500 ms end-to-end" is realistic for text→gloss→playback. It is not realistic once speech recognition is included. Target **< 500 ms for typed input** and **< 2.5 s from end of utterance for speech** (streaming faster-whisper on a GPU server).
6. **Whisper "fine-tuned on medical Arabic".** Start with `whisper-large-v3` (via faster-whisper) plus a domain prompt and vocabulary biasing. Fine-tune only if the measured word error rate on recorded ENT dictation is too high (see Phase 4 gate).

---

## 3. Architecture

```
┌──────────────────────┐        WebSocket (session room)       ┌──────────────────────┐
│ Patient tablet (PWA) │◄─────────────────────────────────────►│ Doctor device (PWA)  │
│ Q&A · keyboard ·     │                                       │ mic/typing · summary │
│ body map · player    │                                       │ message feed · TTS   │
└─────────┬────────────┘                                       └─────────┬────────────┘
          │ HTTPS (LAN, hospital server)                                 │
┌─────────▼──────────────────────────────────────────────────────────────▼───────────┐
│ FastAPI app (medsign.api)                                                          │
│  sessions · Q&A engine · keyboard · translation · ASR · TTS · auth · audit         │
├───────────────┬──────────────────┬──────────────────┬──────────────────────────────┤
│ qa_engine     │ translation      │ asr              │ ranking                      │
│ JSON decision │ phrase lib → rule│ faster-whisper   │ LightGBM / logistic model    │
│ trees + ENT   │ pipeline → AraT5 │ streaming        │ over context features        │
│ ontology      │ → fingerspell    │                  │                              │
├───────────────┴──────────────────┴──────────────────┴──────────────────────────────┤
│ PostgreSQL (SQLAlchemy + Alembic) · field-level AES-256-GCM · MinIO/local media    │
│ Redis (pub/sub for WebSocket rooms, task queue)                                    │
└────────────────────────────────────────────────────────────────────────────────────┘
Admin/content portal: FastAPI + Jinja2/HTMX (or SQLAdmin) for clinicians and interpreters
```

Everything runs on one on-premises hospital server (Docker Compose), so patient data stays on the hospital network as PDPL 2022 requires. One GPU (≥ 12 GB, for example an RTX 4070) is enough for Whisper and AraT5 inference. **The OMR 3,000 budget has no line for a server or GPU, so this needs a decision**: use hospital or University of Nizwa hardware, or run CPU-only with `whisper-small`/`medium` and accept higher latency.

### 3.1 Python stack

| Concern | Choice |
|---|---|
| API / realtime | FastAPI, Uvicorn, WebSockets, Pydantic v2 |
| DB | PostgreSQL 16, SQLAlchemy 2.0, Alembic |
| Cache / pub-sub / jobs | Redis, `arq` or Celery |
| ASR | `faster-whisper` (CTranslate2), Silero VAD |
| Arabic NLP | CAMeL Tools (morphology, lemmas), `rapidfuzz` |
| Translation model | Hugging Face `transformers`, AraT5-base, PEFT/LoRA |
| Gloss → Arabic text | Template grammar first, AraT5 later |
| Sign ranking | scikit-learn / LightGBM |
| TTS (doctor side) | Pre-recorded audio for macros; Coqui XTTS or Piper Arabic voice for free text, with browser `speechSynthesis` as fallback |
| Pose extraction (avatar stretch) | MediaPipe Holistic, NumPy, export to glTF animation |
| Media | FFmpeg (normalise clips to H.264/WebM, 480p, loopable) |
| Security | `cryptography` (AES-GCM), Argon2 password hashing, JWT short-lived tokens |
| Research analytics | pandas, SciPy, statsmodels, matplotlib, Jupyter |
| Quality | pytest, pytest-asyncio, hypothesis, ruff, mypy, pre-commit, GitHub Actions |
| Packaging | `uv`, Docker, Docker Compose |

---

## 4. Repository layout

The current repository is the E-Research platform (TypeScript). MedSign AI should have **its own repository** (for example `aiac-dotcom/medsign-ai`, MIT licence, as the proposal promises).

```
medsign-ai/
├── pyproject.toml                 # uv-managed, Python 3.12
├── docker-compose.yml             # api, worker, postgres, redis, minio, nginx
├── src/medsign/
│   ├── api/                       # FastAPI routers: auth, sessions, qa, keyboard, translate, asr, admin
│   ├── realtime/                  # WebSocket hub, Redis pub/sub, session pairing via QR code
│   ├── qa_engine/                 # decision-tree schema, validator, runner, summary generator
│   ├── keyboard/                  # lexicon service, message composer, gloss→Arabic
│   ├── translation/               # phrase_lib.py, rules.py, model.py (AraT5), fingerspell.py, pipeline.py
│   ├── asr/                       # streaming Whisper service, VAD, domain prompt
│   ├── ranking/                   # feature builder, training, inference
│   ├── tts/
│   ├── media/                     # clip ingestion, FFmpeg normalisation, manifests
│   ├── security/                  # crypto, RBAC, audit log, de-identification
│   ├── db/                        # models, migrations
│   └── research/                  # SUS, SCCS, CEI, outcome exports
├── content/
│   ├── qa_trees/ent_v1.yaml       # 50+ questions, versioned and reviewed by ENT physicians
│   ├── lexicon/ent_signs.csv      # gloss, Arabic, English, category, clip id, synonyms
│   └── phrases/doctor_phrases.csv # pre-translated clinician phrases
├── web/patient/  web/doctor/      # PWA clients (TypeScript, Vite, three.js for body map/avatar)
├── ml/                            # notebooks + training scripts (ASR WER eval, AraT5 fine-tune, ranking)
├── analysis/                      # pilot statistics notebooks
└── tests/
```

---

## 5. Core modules in detail

### 5.1 Clinical Q&A engine (Channel B, Layer 1)
- **Format:** each question tree is a YAML file validated by Pydantic. Nodes contain `id`, `clip_id`, `answers[]` (each with its own `clip_id`, `icon`, `next`, and `codes`), plus optional `widget: body_map | pain_scale`.
- **Validator** (run in CI): no unreachable nodes, no cycles, every path ends at a terminal node, every `clip_id` exists in the media manifest.
- **Runner:** stateless function `next_node(tree, answers_so_far)`, so it is easy to test and works offline in the PWA (the tree ships as JSON).
- **Summary generator:** maps answer codes to Arabic clinical sentences through templates (for example "الشكوى الرئيسية: ألم في الأذن اليسرى منذ ٣ أيام، شدة ٧/١٠"). It is deterministic and needs no LLM, so every line traces back to a tap. Body-map regions use a fixed ENT anatomy code list (ear L/R, outer/middle, nose, throat, neck, and so on).

### 5.2 Sign keyboard (Layer 2) and macros (Layer 3)
- The lexicon is loaded from `ent_signs.csv` into the DB and edited through the portal. It has 8 categories, as in the proposal.
- **Gloss → Arabic:** a slot grammar covers the common patterns (body part + symptom + time + severity). Anything outside the grammar falls back to joining the glosses' Arabic labels. Later an AraT5 model can be trained on patient-composed messages collected in the pilot.
- **Context-aware ranking:** features are the chief-complaint code, current category, previously selected signs and global frequency. Version 1 is a frequency/co-occurrence baseline (it needs no training data). Version 2 is a LightGBM ranker trained on pilot logs. Measure success by the mean tap position of the chosen sign.
- **Macros** are fixed records with a pre-recorded Arabic audio file, so they play instantly on the doctor device.

### 5.3 Translation pipeline (Channel A)
`translate(text) -> list[GlossToken]`, where each token is `(gloss, clip_id | None, fingerspell: bool)`:
1. Normalise the Arabic text (diacritics, alef/ya/ta-marbuta variants, digits).
2. Phrase library match (`rapidfuzz` ≥ 90). If it hits, return the curated gloss sequence.
3. Rule pipeline: tokenize with CAMeL Tools, lemmatise, map each lemma to a lexicon gloss, drop function words, apply ArSL reordering rules (time first, topic–comment).
4. If coverage is below a threshold, run the AraT5 model and keep only glosses that exist in the lexicon.
5. Any remaining word is fingerspelled with the ArSL alphabet clips and shown as text.
- Every translation is logged with its source layer, so the evaluation can report accuracy per layer.
- **Safety rule:** the doctor sees the gloss sequence and the back-translated Arabic before sending, and can edit or use a phrase-library item instead.

### 5.4 ASR
- Streaming over WebSocket: 16 kHz PCM chunks → Silero VAD → faster-whisper with `language="ar"` and an `initial_prompt` containing ENT terms.
- The doctor always confirms or edits the transcript before it is translated. No transcript is sent unconfirmed.
- Phase 4 gate: record 30–60 minutes of consented ENT dictation, measure WER. Fine-tune with LoRA only if WER is above 20%.

### 5.5 Realtime sessions
- The doctor creates a session, and the patient tablet scans a QR code to join. Each room is a Redis channel.
- Message types: `qa_summary`, `patient_message`, `macro`, `doctor_message` (glosses, clips, text), `ack`, `typing`.
- The PWA works offline for Q&A and keyboard. Messages queue locally and sync when the network returns.

### 5.6 Security, privacy and compliance
- Minimal PHI. Use a per-visit pseudonymous ID and never store national ID.
- AES-256-GCM field encryption for free text and summaries, with keys in an env/secret file on the server (rotation documented). TLS on the LAN through nginx.
- Role-based access: patient device, clinician, interpreter/content editor, researcher (de-identified exports only), admin.
- An append-only audit log for every view and export.
- Data retention and de-identification scripts for the open dataset (k-anonymity check on quasi-identifiers).
- IRB protocol and consent forms (in Arabic, with ArSL video versions) are prepared in Phase 1.

### 5.7 Research and evaluation tooling
- **SUS** scoring (standard 10-item formula), **SCCS** (percentage of gold-standard interview items captured by the system summary, scored with a rubric per item), **CEI**, consultation time, adverse events per 100 encounters.
- Paired t-tests or Wilcoxon tests, 95% CIs for proportions (Wilson), and a pre-registered analysis notebook.
- Event logging (taps, timings, translation layer used) is built in from v1, because the pilot data is the main research output.

---

## 6. Development plan mapped to the proposal's 40 weeks

| Weeks | Proposal phase | Engineering work | Exit criteria |
|---|---|---|---|
| 1–3 | 1 Planning & IRB | Set up the repo, CI, Docker Compose skeleton, coding standards. Write the data model and threat model. Draft the IRB data-handling section. | CI green; `docker compose up` serves `/health`; IRB submitted |
| 4–5 | 2 Needs analysis | Define the Q&A YAML schema and validator, lexicon CSV schema and phrase-library format. Clinicians draft trees directly in YAML or a spreadsheet that is converted. Build **clickable PWA prototypes** with placeholder clips for co-design sessions. | 50+ questions pass the validator; 300-sign list agreed; prototype tested with deaf focus group |
| 6–10 | 3 Architecture & UX | Build the backend core: auth, sessions, WebSocket hub, Q&A runner, summary generator, lexicon API, admin portal. Patient PWA: Q&A flow, pain scale, 2D body map (SVG first, 3D later). Start the ASR WER baseline. | Patient completes the full Q&A on a tablet and the doctor sees the Arabic summary live |
| 11–14 | 4 App development | Keyboard plus composer plus gloss→Arabic, macros with TTS, translation pipeline layers 1–3 and fingerspelling, clip-sequence player, doctor PWA (mic, confirm, send), offline cache. **v1.0 release.** | Both channels work end to end on hospital Wi-Fi and in offline mode; p95 typed latency < 500 ms |
| 15–18 | 5 Video production | Media ingestion pipeline (FFmpeg normalise, QC report, manifest). Interpreter annotates parallel sentences, then fine-tune AraT5 (layer 4). Frequency-baseline ranker. **Stretch:** MediaPipe pose extraction to a three.js avatar prototype. | All 300+ sign clips and 50+ question clips live; translation accuracy measured on a held-out set |
| 19–20 | 6 Deployment | Install on the hospital server; harden (TLS, backups, monitoring); provision tablets as kiosks (Guided Access / Android screen pinning). Run load and failure drills. | Runs 48 h on site without errors; backup restore tested |
| 21–24 | 7a Usability | Instrumented builds; SUS and think-aloud tooling; fix the top usability issues in weekly releases. | SUS ≥ 70, or a documented redesign list |
| 25–35 | 7b Clinical pilot | Freeze features (bug fixes only). Collect data, run weekly data-quality checks, train the v2 ranker on logs mid-pilot if there is enough data. | n = 50 consultations logged; dataset complete |
| 29–30 | 8 Staff training | Training mode in the doctor app with demo patient data; 1-page quick guide. | 15 staff trained |
| 36–40 | 10 Dissemination | Final analysis notebooks, de-identified dataset release, open-source release with docs, technical appendix for the paper. | Tagged v1.x on GitHub; dataset and paper submitted |

The proposal fits development into weeks 6–14 (9 weeks). That is tight for a student team, so the MVP scope (section 7) is fixed and the avatar is kept off the critical path.

---

## 7. MVP scope versus stretch goals

**MVP (must exist for the pilot):** Q&A engine with body map and pain scale; sign keyboard with 300+ clips; macros with audio; doctor app with typed and spoken input plus confirmation; translation layers 1–3 plus fingerspelling; clip-based signing playback; realtime sessions; offline Q&A and keyboard; encryption, audit and research logging; admin portal for content.

**Stretch:** 3D avatar driven by poses from the clips; 3D body map; AraT5 for gloss→Arabic; LightGBM ranker; Whisper fine-tune; Arabic neural TTS for free text.

---

## 8. Team roles (suggested)

| Role | Work |
|---|---|
| Backend lead (Python) | FastAPI, DB, realtime, security, deployment |
| AI/NLP | ASR evaluation, translation pipeline, AraT5 fine-tune, ranking |
| Frontend | Patient and doctor PWAs, body map, player, offline |
| Content and clinical liaison | Q&A trees with ENT physicians, lexicon, interpreter scheduling, media QC |
| Research and evaluation | IRB, instruments, data pipeline, statistics |
| Supervisor | Architecture review, release sign-off |

---

## 9. Testing strategy
- **Unit:** Q&A runner (property tests with `hypothesis`: every path terminates), summary templates, translation layers, crypto round-trip, SUS/SCCS formulas against hand-computed examples.
- **Content CI:** tree validator, lexicon/manifest consistency, clips present and with the right duration and codec.
- **Integration:** two simulated WebSocket clients run a full consultation; offline sync replay.
- **Model evaluation:** ASR WER and translation gloss accuracy and BLEU on held-out sets, reported per release.
- **End to end:** Playwright on tablet viewports (iPad, Android).
- **Clinical safety review:** an ENT physician signs off each Q&A tree version and the phrase library before deployment.

---

## 10. Main risks and mitigations

| Risk | Mitigation |
|---|---|
| No Arabic→ArSL parallel data | Phrase library and rules first; the interpreter annotates a small corpus; the model is used only as a fallback |
| ArSL regional variation (Omani vs unified ArSL) | Deaf community focus group approves every sign; the lexicon stores variants |
| Avatar not ready in time | MVP uses real interpreter clips |
| No server or GPU in budget | Use hospital or university hardware; CPU fallback with smaller Whisper |
| Hospital IT and security approval | Engage hospital IT in Phase 1; on-premises Docker deployment; PDPL documentation |
| Unsafe mistranslation | The doctor confirms every outgoing message; patient-side "I don't understand" macro; translation layer logged |
| Small pilot sample (n = 50) | Pre-registered analysis; report effect sizes and CIs, not only p-values |

---

## 11. First steps (weeks 1–2)
1. Create the `medsign-ai` repository with the layout above, `uv`, ruff, mypy, pytest, pre-commit and GitHub Actions.
2. Docker Compose with FastAPI, PostgreSQL and Redis, plus a `/health` endpoint.
3. Pydantic schemas for the Q&A tree, lexicon entry, phrase and session message, plus the tree validator and a 5-question sample ENT tree.
4. A minimal patient PWA that plays a placeholder clip per question and posts answers; a doctor page that shows the live summary.
5. Decide on the server/GPU and on the PWA vs Flet question in section 2.
