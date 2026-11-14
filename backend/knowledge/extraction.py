"""Subject-focused concept extraction, noise/person filtering, and grounded verification."""

from collections import defaultdict
import math
from pathlib import Path
import re
import unicodedata

from materials.models import Material

WORDS = re.compile(r"[^\W_]+", re.UNICODE)
CONTROL_GLYPHS = re.compile(r"[\uf000-\uf8ff\x00-\x08\x0b-\x1f]")
REPEATED_GLITCH = re.compile(r"\b([A-Za-zÀ-ÖØ-öø-ÿ]{3,18})\1{2,}\b")
EMAIL_RE = re.compile(r"\b([A-Za-z0-9._%+-]+)@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b")
URL_RE = re.compile(r"(?:https?://\S+|www\.\S+)", re.IGNORECASE)
PHONE_RE = re.compile(r"\b\d{2,4}[-.\s]\d{3,4}[-.\s]\d{3,4}\b")
EXAM_SECTION_RE = re.compile(
    r"^\s*(?:[A-Z]|\d{1,3})[.)]\s+(.+?)\s*(?:\(\s*\d+\s+points?\b.*\)|$)",
    re.IGNORECASE,
)
BULLET_HEAD_RE = re.compile(r"^\s*(?:[•\-*o▪►]|(?:\d{1,2}|[A-Za-z])[.)])\s+(.+)$")
PERSON_HEADER_RE = re.compile(
    r"\b(?:instructors?|teachers?|professors?|prof\.|lecturers?|tutors?|teaching\s+assistants?|exercise\s+sessions?|co-teacher(?:s)?|authors?|textbooks?)\b",
    re.IGNORECASE,
)
SPOKEN_PERSON_RE = re.compile(
    r"\b(?:i am|i'm|my name is|co-teacher with|meet with|interview with|talking about you|written by|novel by|concerts of|concerts featuring|professor|prof\.?|dr\.?)\s+"
    r"([A-ZÀ-ÖØ-Þ][A-Za-zÀ-ÖØ-öø-ÿ'’-]{1,24}(?:\s+[A-ZÀ-ÖØ-Þ][A-Za-zÀ-ÖØ-öø-ÿ'’-]{1,24}){0,2})"
)
INITIAL_SURNAME_RE = re.compile(r"\b[A-Z]\.\s+([A-ZÀ-ÖØ-Þ][a-zà-öø-ÿ'’-]{2,24})\b")
TITLECASE_SEQ_RE = re.compile(
    r"\b([A-ZÀ-ÖØ-Þ][a-zà-öø-ÿ'’-]{1,24}(?:\s+[A-ZÀ-ÖØ-Þ][a-zà-öø-ÿ'’-]{1,24}){1,3})\b"
)
LOGISTICS_HEADING_RE = re.compile(
    r"^(?:instructors?|teachers?|attendance|textbooks?|bibliography|teaching\s+material|prerequisites?|exam\s+rules|cheating|office\s+hours?|course\s+calendar)\b",
    re.IGNORECASE,
)
LOGISTICS_CUE_RE = re.compile(
    r"(?:@|webeep|moodle|blackboard|canvas|polimi\.it|attendance\s+is|textbooks?\b|prerequisites?\b|exam\s+rules\b|cheating\s+polic|positive\s+marks|negative\s+marks|remote\s+exams|1st\s+floor|2nd\s+floor|3rd\s+floor|office\s+hours?|co-teacher|standard\s+calendar|tutoring\b|english\s+copy|italian\s+language)",
    re.IGNORECASE,
)
SYLLABUS_CUE_RE = re.compile(
    r"(?:main\s+topics?|what\s+you\s+will\s+learn|topics?\s+of\s+the\s+course|syllabus|technology\s+of|opening\s+the)",
    re.IGNORECASE,
)

STOP = set(
    "a an and are as at be by can do does for from how in is of on or the to what when where which why with "
    "all also any but could each have has if into its may more must not one only other our over per "
    "please point points should such than that their them there these this those through use used using well will would you your "
    "about above across after again against already also always among another around because been before being below between both "
    "cannot could did doing done down during either else enough even ever every few further get getting give given goes going got "
    "had having her here hers him his however i it itself just keep kind know knowing less let lets like likely long lot lots "
    "made make making many maybe mean means might more most much must myself name need neither never new next no nor nothing now "
    "off often old once onto own part parts perhaps rather really right said same saw say saying see seen several she should show "
    "shown since small so some something sometimes soon sort still such take taking tell than thank thanks then there these they "
    "thing things think this those though thought three through thus time times today together told too toward two under until up "
    "upon us usually very want was way we were what whatever when where whether which while who whom whose why will with within "
    "without work working yes yet "
    "ve veya bir bu şu için ile nasıl nedir hangi olarak olur olan da de mi mı mu mü".split()
)

ADMIN_AND_FILLER = set(
    "academic actual addendum admin administrative agenda allowed answer answers anything archive attendance author authors "
    "available background basic basics basis beginning behavior behaviour bibliography big book books building calendar call called "
    "case cases center centre certain check cheating class classes classic classical colleague colleagues common company compare "
    "complete complicated concept concepts conclusion consider considers considering contain contains containing content contents "
    "context continue copy core course courses cover covered covering current date dates day days default define defined degree "
    "describe described detail details different divide division document documents door download downloadable due dur duration "
    "early edition effort eligible email emails end english entire establish establishing etc evaluate evaluation exact exactly exam "
    "examination exams example examples exercise exercises explain explained explanation fact facts fail failing failure false "
    "feature features fellow final finally find finding first floor follow following foo bar foreign form forms forum free full "
    "fully general given goal grade grades grading group half help helping high home homework hour hours idea ideas important "
    "include included includes including index info information initial initially instead instructor instructors intro introduce "
    "introduced introduction issue issues italian item items itself joke justify justified known lamentably language large last "
    "late later learn learning least lecture lectures lecturer lecturers lesson lessons level levels line lines link links list "
    "listed look looking low main major make mandatory mark marking marks material materials matter mention mentioned minor "
    "minute minutes mode module modules month months more most multiple name named names natural near necessary negative neither "
    "next nice non normally note noted notes notion number numbers numerous obtained obvious office online open opening opinion "
    "opportunity option optional oral order organization organize other outline over overall overview page pages part particular "
    "past people percent performance perhaps person personal piece places plagiarism plan player point points policies policy "
    "politecnico pop portal positive possible potential practical practice presence present presented previous primarily problem "
    "problems program programmed projects proper properly propose proposal provided providing question questions quick quite rather "
    "read reading reason reasons recent recently record recorded recording recordings reference references refresh refreshed "
    "regarding regular related relation relative release releases relevant remain remaining remark remarks remote reorganize "
    "repeated report reported require required requirement requirements result results review role roles room rule rules said "
    "same say saying scenario scenarios school second seconds section sections see seen self seminar sense separate serious "
    "session sessions several share shared short show showing shows side simple simply single site slide slides slight slightly "
    "slot slots small sneak peek software solution solutions someone something somewhat soon sort specific specifically staff stage "
    "stages standard start starting statements status step steps still stop stored story strictly student students study subject "
    "subjects suppose supposed sure syllabus teacher teachers teaching tell term terms test tests textbook textbooks text thing "
    "things think third thought time times title today tomorrow topic topics total track true truly trying tutor tutoring tutors "
    "twice type types typical typically university unless unlikely until update updated use useful user users usual usually value "
    "values various version versions via video videos view want way website webeep week weeks welcome whole whose wide work working "
    "world worth write writing written wrong year years yesterday".split()
)

# Generic nouns allowed *inside* multi-word phrases (e.g. "Query management", "Transaction management")
# but rejected as standalone single-word topics.
STANDALONE_GENERIC = set(
    "access action actions admin analysis application applications architecture architectures area areas attribute attributes "
    "base bases block blocks box boxes case code codes column columns command commands component components computation computer "
    "condition conditions constraint constraints control cost costs count criteria criterion data database databases db dbms dbs "
    "dataset datasets definition description design distributed distribution distributions dynamic element elements employee employees entity "
    "entities entry entries environment error event events execution field fields file files focus function functions graph "
    "hardware hierarchical indicator indicators input inputs instance instruction instructions integration interface job key keys knowledge "
    "label labels language length level list logic logical machine machines management manager mechanism memory message method methods "
    "model models module name node nodes number object objects operation operations optimization optimisation output outputs "
    "parameter parameters path pattern period phase physical process processing product profile program programming property properties queries query "
    "range rate record records region relational relation relationship resource result right row rows rule scale scenario schema schemas "
    "scheme search section selection sequence sequential server service set singer source sources space state statement status step store "
    "structure structures summary support system systems table tables target task technique techniques technology technologies "
    "template text theory ticket time tool tools topic transfer tree tuple tuples type unit units update user value values "
    "variable variables view width window".split()
)

# Technical nouns/modifiers indicating a capitalized phrase is an academic subject, not a person name.
TECH_HEADWORDS = set(
    "acid algebra algorithm algorithms aliasing allocation architecture architectures automata bandwidth base bayesian "
    "b+ btree buffer cache caching calculus chain chains classification clustering coding compiler compilers complexity "
    "compression computation concurrency conflict constraint constraints control cryptography data database databases "
    "db dbms dbs deadlock deadlocks decomposition dependency dependencies design distribution distributed dynamic "
    "encryption engine entity equation equations equilibrium estimation evaluation evolution execution expression "
    "filtering finite fourier functional graph graphs greedy hash hashing heap heuristic hierarchy hierarchical "
    "huffman impedance indexing index information integration integrity isolation java jdbc join joins jpa json "
    "kernel kinetics laplace law laws learning limit linear liveness locking locks log logging logic logs management "
    "manager markov matrix memory method methods mining model models modelling modeling monitoring multiobjective "
    "network networks neural neuronal normalization nosql notation object objective objects odbc ontology oo "
    "operating operational operator optimization optimisation optimizer order ordering orm overflow page paging "
    "parallel parsing partitioning path patterns performance persistence persistent physical pipelining plan planning "
    "pointer pointers poisson policy polynomial population prefetching primary probabilistic probability processing "
    "protocol protocols pruning query queries queue queueing queues ranking recovery regression relational "
    "relationship reliability replication representation resolution retrieval rollback routing rule rules sampling "
    "scaling schedule schedules scheduling schema schemas search secondary security selection semantics semijoin "
    "sequential serializability serializable serialization set shadow sharding skyline skylines snapshot sorting "
    "spanning spatial sql stability standard state static statistics storage storing streaming strict structure "
    "structures subspace subtyping summary synchronization syntax system systems table tables temporal theorem "
    "theorems theory thermodynamics threading timestamp timestamps transaction transactions transactional transform "
    "traversal tree trees trigger triggers tuning tuple tuples turing two-phase uml undo union update updating "
    "validation variable variance vector vectors verification view views virtual virtualization warehouse xml xquery".split()
)

DOMAIN_SHORT_ACRONYMS = {
    "ai", "b+", "b-tree", "cc", "cpu", "db", "dl", "er", "fk", "io", "ml", "nl", "oo", "os", "pk", "qa", "rl", "ts", "2pl",
}

MAX_TOPICS = 10
MAX_SOURCES = 6
MAX_QUESTIONS = 100
MAX_CHUNKS = 200


def clean_source_noise(text):
    cleaned = unicodedata.normalize("NFKC", text or "")
    cleaned = CONTROL_GLYPHS.sub(" ", cleaned)
    cleaned = REPEATED_GLITCH.sub(r"\1", cleaned)
    cleaned = re.sub(r"([a-z])questions([a-z])", r"\1 \2", cleaned)
    return cleaned


def normalize_name(name):
    return " ".join(unicodedata.normalize("NFKC", name or "").casefold().split())


def ascii_fold(text):
    decomposed = unicodedata.normalize("NFKD", text or "")
    return "".join(ch for ch in decomposed if not unicodedata.combining(ch))


def stem_word(word):
    w = unicodedata.normalize("NFKC", word or "").casefold()
    if len(w) <= 3:
        if w == "dbs":
            return "db"
        return w
    if w.endswith("ies") and len(w) > 4:
        return w[:-3] + "y"
    if w.endswith("es") and len(w) > 4 and w[-3] in ("s", "x", "z", "h"):
        return w[:-2]
    if w.endswith("s") and not w.endswith(("ss", "us", "is", "as")):
        return w[:-1]
    return w


def concept_stem_key(text):
    tokens = [stem_word(t) for t in WORDS.findall(clean_source_noise(text)) if t]
    filtered = [t for t in tokens if t not in STOP or t in {"and", "or"}]
    return " ".join(filtered or tokens)


def domain_tokens(text):
    cleaned = clean_source_noise(text)
    cleaned = EMAIL_RE.sub(" ", cleaned)
    cleaned = URL_RE.sub(" ", cleaned)
    out = set()
    for match in WORDS.finditer(cleaned):
        raw = match.group(0)
        low = raw.casefold()
        if low.isdigit():
            continue
        if len(low) < 3 and not (raw.isupper() and low in DOMAIN_SHORT_ACRONYMS):
            continue
        if low in STOP:
            continue
        out.add(stem_word(low))
    return out


def is_person_like_phrase(phrase_text, person_registry):
    norm = normalize_name(phrase_text)
    folded = normalize_name(ascii_fold(phrase_text))
    if not norm:
        return True
    if norm in person_registry["full_names"] or folded in person_registry["full_names"]:
        return True
    words = [w for w in WORDS.findall(clean_source_noise(phrase_text)) if w]
    if not words:
        return True
    word_lows = [w.casefold() for w in words]
    word_folded = [ascii_fold(w) for w in word_lows]
    if any(tok in person_registry["rare_tokens"] for tok in word_lows + word_folded):
        return True
    # Morphological check: 2-3 capitalized TitleCase words with no uppercase acronyms, no tech terms,
    # and never appearing in lowercase prose across the course.
    if 2 <= len(words) <= 3 and all(len(w) >= 2 and w[0].isupper() and w[1:].islower() for w in words):
        if not any(
            stem_word(w) in TECH_HEADWORDS or w in TECH_HEADWORDS or w in person_registry["lowercased_words"]
            for w in word_lows
        ):
            return True
    return False


def _harvest_titlecase_sequences(line, full_names, rare_tokens):
    for match in TITLECASE_SEQ_RE.finditer(line):
        seq = match.group(1).strip()
        seq_words = [w for w in WORDS.findall(seq) if w]
        if 2 <= len(seq_words) <= 4 and not any(
            w.casefold() in STOP or w.casefold() in TECH_HEADWORDS or stem_word(w.casefold()) in TECH_HEADWORDS
            for w in seq_words
        ):
            full_names.add(normalize_name(seq))
            full_names.add(normalize_name(ascii_fold(seq)))
            for idx in range(len(seq_words) - 1):
                pair = f"{seq_words[idx]} {seq_words[idx + 1]}"
                full_names.add(normalize_name(pair))
                full_names.add(normalize_name(ascii_fold(pair)))
            for w in seq_words:
                low = w.casefold()
                if len(low) >= 3 and low not in ADMIN_AND_FILLER:
                    rare_tokens.add(low)
                    rare_tokens.add(ascii_fold(low))


def extract_course_noise(course, chunks, questions):
    full_names = set()
    rare_tokens = set()
    lowercased_words = set()

    texts = [chunk.text for chunk in chunks] + [question.text for question in questions]
    for raw_text in texts:
        text = clean_source_noise(raw_text)
        for email_match in EMAIL_RE.finditer(text):
            local_parts = [p for p in re.split(r"[._+\-]+", email_match.group(1).casefold()) if len(p) >= 3]
            if len(local_parts) >= 2:
                joined = " ".join(local_parts)
                full_names.add(joined)
                full_names.add(ascii_fold(joined))
            for part in local_parts:
                if part not in TECH_HEADWORDS and part not in ADMIN_AND_FILLER and part not in STOP:
                    rare_tokens.add(part)
                    rare_tokens.add(ascii_fold(part))

        prose_without_links = URL_RE.sub(" ", EMAIL_RE.sub(" ", text))
        for tok in WORDS.findall(prose_without_links):
            if len(tok) >= 3 and tok.islower():
                lowercased_words.add(tok)
                lowercased_words.add(stem_word(tok))

        for line in prose_without_links.splitlines():
            stripped = line.strip()
            if not stripped:
                continue
            if PERSON_HEADER_RE.search(stripped):
                _harvest_titlecase_sequences(stripped, full_names, rare_tokens)
            for match in SPOKEN_PERSON_RE.finditer(stripped):
                _harvest_titlecase_sequences(match.group(1), full_names, rare_tokens)
            for match in INITIAL_SURNAME_RE.finditer(stripped):
                sur = match.group(1).casefold()
                if len(sur) >= 3 and sur not in TECH_HEADWORDS and sur not in ADMIN_AND_FILLER:
                    rare_tokens.add(sur)
                    rare_tokens.add(ascii_fold(sur))

    # Avoid false person hits for ordinary domain words that genuinely occurred lowercase in technical prose.
    rare_tokens -= lowercased_words
    rare_tokens -= TECH_HEADWORDS
    rare_tokens -= STOP

    course_name_clean = normalize_name(clean_source_noise(course.name if course else ""))
    course_title_keys = set()
    if course_name_clean:
        course_title_keys.add(course_name_clean)
        stripped_num = re.sub(r"\s+(?:[ivx]+|\d+)$", "", course_name_clean).strip()
        if stripped_num:
            course_title_keys.add(stripped_num)
            course_title_keys.add(concept_stem_key(stripped_num))

    return {
        "full_names": full_names,
        "rare_tokens": rare_tokens,
        "lowercased_words": lowercased_words,
        "course_title_keys": {k for k in course_title_keys if k},
    }


def strip_logistics_lines(text):
    lines = []
    for raw_line in clean_source_noise(text).splitlines():
        line = raw_line.strip()
        if not line:
            continue
        if EMAIL_RE.search(line) or PHONE_RE.search(line):
            continue
        if URL_RE.search(line) and len(URL_RE.sub("", line).strip()) < 35:
            continue
        line = URL_RE.sub(" ", line)
        if PERSON_HEADER_RE.match(line):
            continue
        line = re.sub(r"[:\-–—]\s*questions?\s*$", "", line, flags=re.IGNORECASE).strip()
        if line:
            lines.append(line)
    return lines


def is_logistics_chunk(chunk):
    text = clean_source_noise(chunk.text)
    lines = [l.strip() for l in text.splitlines() if l.strip()]
    first_lines = " ".join(lines[:2])
    if SYLLABUS_CUE_RE.search(text):
        return False
    if LOGISTICS_HEADING_RE.search(first_lines):
        return True
    cues = len(LOGISTICS_CUE_RE.findall(text))
    if chunk.material.kind == Material.Kind.TRANSCRIPT and cues >= 2:
        return True
    if chunk.material.kind == Material.Kind.SLIDES and cues >= 3:
        return True
    return False


def is_blocked_concept(text, course_noise):
    norm = normalize_name(text)
    stemmed = concept_stem_key(text)
    if not norm or not stemmed or len(norm) > 120:
        return True
    if norm in course_noise["course_title_keys"] or stemmed in course_noise["course_title_keys"]:
        return True
    if is_person_like_phrase(text, course_noise):
        return True
    words = [w for w in WORDS.findall(clean_source_noise(text)) if w]
    if not words:
        return True
    lows = [w.casefold() for w in words]
    if all(w in STOP or w in ADMIN_AND_FILLER or w.isdigit() for w in lows):
        return True
    if len(lows) == 1:
        w = lows[0]
        sw = stem_word(w)
        if w in STANDALONE_GENERIC or sw in STANDALONE_GENERIC:
            return True
        if len(w) < 3 and not (words[0].isupper() and w in DOMAIN_SHORT_ACRONYMS):
            return True
    if lows[0] in STOP or lows[-1] in STOP or lows[0] in ADMIN_AND_FILLER or lows[-1] in ADMIN_AND_FILLER:
        return True
    return False


def topic_supports_text(topic_name, keywords, text):
    """Verify that raw course text genuinely discusses this topic or its validated keywords."""
    cleaned = clean_source_noise(text)
    if not cleaned:
        return False
    low_cleaned = cleaned.casefold()
    text_tokens = domain_tokens(cleaned)

    candidates = [topic_name] + [k for k in (keywords or []) if isinstance(k, str) and k.strip()]
    for phrase in candidates:
        p_norm = normalize_name(phrase)
        if not p_norm:
            continue
        p_words = [w for w in WORDS.findall(p_norm) if w]
        if not p_words:
            continue
        if len(p_words) == 1:
            token = p_words[0]
            if stem_word(token) in text_tokens:
                return True
            if re.search(rf"(?<!\w){re.escape(token)}(?!\w)", low_cleaned):
                return True
        else:
            p_stems = [stem_word(w) for w in p_words if w not in STOP]
            if p_stems and len(p_stems) <= 4 and all(s in text_tokens for s in p_stems):
                return True
            regex = r"\b" + r"[\s,/\-–—]+".join(re.escape(w) + r"s?" for w in p_words) + r"\b"
            if re.search(regex, low_cleaned):
                return True

    name_tokens = {
        t for t in domain_tokens(topic_name)
        if t not in ADMIN_AND_FILLER and t not in STANDALONE_GENERIC
    }
    if not name_tokens:
        name_tokens = domain_tokens(topic_name)
    overlap = name_tokens & text_tokens
    if len(name_tokens) == 1 and overlap:
        return True
    if len(overlap) >= 2:
        return True
    return False


def _split_heading_candidates(line):
    cleaned = BULLET_HEAD_RE.sub(r"\1", line).strip()
    cleaned = re.sub(r"\s*\(\s*etc\.?\s*\)", "", cleaned, flags=re.IGNORECASE)
    pieces = []
    # Split parenthetical clarifications so e.g. "DB architecture/technologies (concurrency control)" yields both.
    for segment in re.split(r"[();|]+", cleaned):
        part = re.split(r"\s*[:–—?]\s*", segment.strip(), maxsplit=1)[0].strip(" .,:;/-")
        if not part:
            continue
        pieces.append(part)
        if "/" in part or " and " in part.lower():
            for sub in re.split(r"\s*/\s*|\s+\band\b\s+", part, flags=re.IGNORECASE):
                sub_clean = sub.strip(" .,:;/-")
                if sub_clean:
                    pieces.append(sub_clean)
    return [p for p in pieces if 1 <= len(WORDS.findall(p)) <= 5]


def _extract_phrases_from_lines(lines):
    """Yield (phrase_text, is_heading_flag) from cleaned lines."""
    for line_idx, line in enumerate(lines):
        looks_like_heading = (
            line_idx <= 1 and len(WORDS.findall(line)) <= 6
        ) or bool(BULLET_HEAD_RE.match(line))
        if looks_like_heading:
            for cand in _split_heading_candidates(line):
                yield cand, True

        word_spans = []
        end = 0
        for match in WORDS.finditer(line):
            if match.start() < end:
                continue
            gap = line[end:match.start()]
            if word_spans and re.fullmatch(r"[ \t/\-]+", gap) is None:
                word_spans.clear()
            end = match.end()
            while end < len(line) and (line[end].isalnum() or line[end] in "+" or unicodedata.category(line[end]).startswith("M")):
                end += 1
            tok = line[match.start():end]
            low = normalize_name(tok)
            if not low or low in STOP or all(ch.isdigit() for ch in low):
                word_spans.clear()
                continue
            if len(low) < 2:
                word_spans.clear()
                continue
            word_spans.append((match.start(), end, tok))
            for span_start in word_spans[-3:]:
                phrase = line[span_start[0]:end].strip(" -/")
                if 2 <= len(phrase) <= 120:
                    yield phrase, False
            word_spans = word_spans[-2:]


def _question_heading(question):
    first_line = clean_source_noise(question.text).splitlines()[0] if question.text else ""
    match = EXAM_SECTION_RE.match(first_line)
    if match:
        return match.group(1).strip()
    before_paren = first_line.split("(", 1)[0].strip()
    if 1 <= len(WORDS.findall(before_paren)) <= 4 and not before_paren.endswith("?"):
        return before_paren
    return ""


def _preferred_display(variants):
    """Choose the cleanest display form among matched literal strings."""
    def rank(item):
        text, count = item
        words = WORDS.findall(text)
        has_plural_s = 1 if len(words) == 1 and text.casefold().endswith("s") else 0
        title_bonus = 1 if text[0:1].isupper() else 0
        return (title_bonus, count, has_plural_s, -len(text))

    best = max(variants.items(), key=rank)[0]
    if best and best[0].islower():
        best = best[0].upper() + best[1:]
    return best


def _select_diverse_chunks(chunk_scores, chunk_by_id, limit=MAX_SOURCES):
    ranked_ids = sorted(chunk_scores, key=lambda cid: (-chunk_scores[cid], cid))
    chosen = []
    seen_kinds = set()
    # First pass picks top-scoring representative of each material kind (slides, transcript, study).
    for kind in (Material.Kind.SLIDES, Material.Kind.TRANSCRIPT, Material.Kind.STUDY):
        for cid in ranked_ids:
            if cid not in chosen and chunk_by_id[cid].material.kind == kind and kind not in seen_kinds:
                chosen.append(cid)
                seen_kinds.add(kind)
                break
    for cid in ranked_ids:
        if len(chosen) >= limit:
            break
        if cid not in chosen:
            chosen.append(cid)
    return sorted(chosen)


def _match_terms_for_chunk(keywords, chunk_text):
    tokens = domain_tokens(chunk_text)
    matched = []
    for kw in keywords:
        kw_tokens = [stem_word(w) for w in WORDS.findall(kw.casefold()) if w not in STOP]
        if kw_tokens and all(t in tokens for t in kw_tokens):
            matched.append(kw)
    return matched[:4]


def extract_local_topics(course, chunks, questions):
    """Extract grounded, non-person academic subjects with multi-modal source and question links."""
    if not chunks:
        return []
    course_noise = extract_course_noise(course, chunks, questions)
    chunk_by_id = {c.pk: c for c in chunks}
    question_by_id = {q.pk: q for q in questions}

    variants = defaultdict(lambda: defaultdict(int))
    chunk_hits = defaultdict(lambda: defaultdict(float))
    heading_chunks = defaultdict(set)
    question_hits = defaultdict(lambda: defaultdict(float))

    for chunk in chunks:
        logistics = is_logistics_chunk(chunk)
        lines = strip_logistics_lines(chunk.text)
        weight_scale = 0.25 if logistics else 1.0
        seen_in_chunk = set()
        for phrase, is_heading in _extract_phrases_from_lines(lines):
            if is_blocked_concept(phrase, course_noise):
                continue
            key = concept_stem_key(phrase)
            if not key:
                continue
            variants[key][phrase] += 2 if is_heading else 1
            seen_in_chunk.add((key, is_heading))
            if is_heading and not logistics:
                heading_chunks[key].add(chunk.pk)

        for key, is_heading in seen_in_chunk:
            base = (2.6 if is_heading else 1.0) * weight_scale
            if chunk_hits[key][chunk.pk] < base:
                chunk_hits[key][chunk.pk] = base

    for question in questions:
        heading = _question_heading(question)
        q_lines = strip_logistics_lines(question.text)
        if heading and not is_blocked_concept(heading, course_noise):
            h_key = concept_stem_key(heading)
            if h_key:
                variants[h_key][heading] += 3
                question_hits[h_key][question.pk] = max(question_hits[h_key][question.pk], 4.0)
        for phrase, _ in _extract_phrases_from_lines(q_lines):
            if is_blocked_concept(phrase, course_noise):
                continue
            key = concept_stem_key(phrase)
            if key in chunk_hits:
                question_hits[key][question.pk] = max(question_hits[key][question.pk], 1.5)

    # Filter down to grounded concepts anchored on teaching chunks (not logistics-only noise).
    eligible = {}
    for key, c_scores in chunk_hits.items():
        non_log_chunks = [cid for cid in c_scores if not is_logistics_chunk(chunk_by_id[cid])]
        q_scores = question_hits.get(key, {})
        if not non_log_chunks:
            continue
        if len(non_log_chunks) < 2 and not q_scores:
            continue
        tok_count = len([t for t in key.split() if t not in {"and", "or"}])
        # Single-word concepts must either be headings/acronyms/domain headwords or have multi-chunk heading/exam evidence.
        if tok_count == 1:
            sample_disp = _preferred_display(variants[key])
            is_heading_or_exam = bool(heading_chunks[key] & set(non_log_chunks)) or bool(q_scores)
            is_acronym = sample_disp.isupper() and len(sample_disp) >= 3
            if not (is_heading_or_exam or is_acronym):
                continue
        kinds = {chunk_by_id[cid].material.kind for cid in non_log_chunks}
        score = (
            sum(c_scores[cid] for cid in non_log_chunks)
            + len(heading_chunks[key]) * 1.8
            + len(q_scores) * 2.5
            + (len(kinds) - 1) * 2.0
        )
        eligible[key] = {
            "key": key,
            "score": score,
            "name": _preferred_display(variants[key]),
            "chunk_scores": {cid: s for cid, s in c_scores.items() if not is_logistics_chunk(chunk_by_id[cid])},
            "question_scores": dict(q_scores),
            "tokens": {t for t in key.split() if t not in {"and", "or"}},
        }

    # Subsumption: fold redundant sub-phrases (e.g. "Sampling" -> "Sampling theorem",
    # "Transaction" -> "Transaction management") into stronger covering compound concepts.
    ordered_keys = sorted(
        eligible,
        key=lambda k: (-len(eligible[k]["tokens"]), -eligible[k]["score"], k),
    )
    retained = []
    absorbed_keywords = defaultdict(list)

    for key in ordered_keys:
        entry = eligible[key]
        entry_chunks = set(entry["chunk_scores"])
        entry_questions = set(entry["question_scores"])
        subsumed_by = None
        for parent in retained:
            parent_chunks = set(parent["chunk_scores"])
            parent_questions = set(parent["question_scores"])
            if entry["tokens"] < parent["tokens"] and entry_chunks:
                overlap_ratio = len(entry_chunks & parent_chunks) / len(entry_chunks)
                q_covered = entry_questions <= parent_questions
                # Only absorb exact sub-phrases if the parent covers almost all of the sub-phrase's chunks/questions,
                # or if the parent is a true compound concept with strong exam/heading evidence.
                if (overlap_ratio >= 0.65 and q_covered) or (overlap_ratio >= 0.8 and len(parent["tokens"]) >= 2):
                    subsumed_by = parent
                    break
        if subsumed_by is not None:
            absorbed_keywords[subsumed_by["key"]].append(entry["name"])
            for cid, cscore in entry["chunk_scores"].items():
                if cid not in subsumed_by["chunk_scores"]:
                    subsumed_by["chunk_scores"][cid] = cscore * 0.75
            for qid, qscore in entry["question_scores"].items():
                subsumed_by["question_scores"][qid] = max(subsumed_by["question_scores"].get(qid, 0.0), qscore * 0.85)
            continue
        retained.append(entry)

    # Sort final candidates by true instructional & exam importance score.
    retained.sort(
        key=lambda e: (
            -(
                e["score"]
                + len(e["question_scores"]) * 2.0
                + (1.5 if len(e["tokens"]) >= 2 else 0.0)
            ),
            e["key"],
        )
    )

    topics = []
    for entry in retained[:MAX_TOPICS]:
        name = entry["name"]
        kw_list = [name]
        for alias in absorbed_keywords[entry["key"]]:
            # Only add multi-word or domain-specific aliases (never single generic modifiers).
            alias_norm = normalize_name(alias)
            if alias_norm and alias_norm not in {normalize_name(k) for k in kw_list}:
                if len(WORDS.findall(alias_norm)) >= 2 or alias_norm not in STANDALONE_GENERIC:
                    kw_list.append(alias)
        kw_list = kw_list[:8]

        # Re-check non-logistics chunks against the unified concept name + aliases.
        refined_chunk_scores = dict(entry["chunk_scores"])
        for chunk in chunks:
            if is_logistics_chunk(chunk) or chunk.pk in refined_chunk_scores:
                continue
            if topic_supports_text(name, kw_list, chunk.text):
                refined_chunk_scores[chunk.pk] = 0.85

        selected_cids = _select_diverse_chunks(refined_chunk_scores, chunk_by_id, limit=MAX_SOURCES)
        selected_qids = sorted(
            qid
            for qid, q in question_by_id.items()
            if qid in entry["question_scores"] or topic_supports_text(name, kw_list, q.text)
        )
        if not selected_cids or (len(selected_cids) < 2 and not selected_qids):
            continue

        max_c = max((refined_chunk_scores[cid] for cid in selected_cids), default=1.0) or 1.0
        source_meta = {}
        for cid in selected_cids:
            terms = _match_terms_for_chunk(kw_list, chunk_by_id[cid].text)
            source_meta[cid] = {
                "score": round(min(1.0, 0.55 + 0.45 * (refined_chunk_scores[cid] / max_c)), 3),
                "reason": f"Covers {', '.join(terms)}" if terms else f"Related to {name}",
            }
        question_meta = {}
        for qid in selected_qids:
            terms = _match_terms_for_chunk(kw_list, question_by_id[qid].text)
            question_meta[qid] = {
                "score": round(min(1.0, 0.65 + 0.1 * len(terms)), 3),
                "reason": f"Tests {', '.join(terms)}" if terms else f"Examines {name}",
            }

        slide_count = sum(1 for cid in selected_cids if chunk_by_id[cid].material.kind == Material.Kind.SLIDES)
        tx_count = sum(1 for cid in selected_cids if chunk_by_id[cid].material.kind == Material.Kind.TRANSCRIPT)
        study_count = sum(1 for cid in selected_cids if chunk_by_id[cid].material.kind == Material.Kind.STUDY)
        where_parts = []
        if slide_count:
            where_parts.append(f"{slide_count} slide{'s' if slide_count != 1 else ''}")
        if tx_count:
            where_parts.append(f"{tx_count} lecture excerpt{'s' if tx_count != 1 else ''}")
        if study_count:
            where_parts.append(f"{study_count} study doc{'s' if study_count != 1 else ''}")
        where_text = ", ".join(where_parts) or "course sources"
        if selected_qids:
            q_text = f"linked to {len(selected_qids)} exam question{'s' if len(selected_qids) != 1 else ''}"
        else:
            q_text = "no linked exam questions yet"
        description = f"Grounded in {where_text}; {q_text}."[:280]

        topics.append({
            "name": name[:120],
            "description": description,
            "keywords": kw_list,
            "chunk_ids": selected_cids,
            "question_ids": selected_qids,
            "source_meta": source_meta,
            "question_meta": question_meta,
        })

    # Second-pass deduplication: absorb any sub-concept whose refined chunks & questions are already covered
    # by an accepted broader compound concept (e.g. "Transaction" alongside "Transaction management").
    deduped = []
    # Keep higher-priority compound/specific topics before plain sub-concepts when chunk/question sets match closely.
    topics_sorted = sorted(
        topics,
        key=lambda t: (
            -(len(t["question_ids"]) * 3 + len(t["chunk_ids"]) + (1.5 if len(WORDS.findall(t["name"])) >= 2 else 0.0)),
            t["name"],
        ),
    )
    for t in topics_sorted:
        t_tokens = {stem_word(w) for w in WORDS.findall(t["name"].casefold()) if w not in STOP}
        t_cids = set(t["chunk_ids"])
        t_qids = set(t["question_ids"])
        merged = False
        for parent in deduped:
            p_tokens = {stem_word(w) for w in WORDS.findall(parent["name"].casefold()) if w not in STOP}
            if t_tokens and t_tokens < p_tokens:
                p_cids = set(parent["chunk_ids"])
                p_qids = set(parent["question_ids"])
                if t_cids <= p_cids or (len(t_cids & p_cids) >= max(1, int(0.75 * len(t_cids))) and t_qids <= p_qids):
                    if normalize_name(t["name"]) not in {normalize_name(k) for k in parent["keywords"]} and len(parent["keywords"]) < 8:
                        parent["keywords"].append(t["name"])
                    merged = True
                    break
        if not merged:
            deduped.append(t)

    return deduped[:MAX_TOPICS]
