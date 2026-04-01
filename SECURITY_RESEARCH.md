# AI Detection Security Research (2026)

## Purpose
This document explains how AI text detectors work and the adversarial techniques used to evade them. This research is for **defensive security purposes** — understanding attack vectors to build stronger detection systems.

## How AI Detectors Work

### 1. Statistical Analysis (Primary Method)

#### Perplexity
- **What it measures**: Token predictability using log-likelihood calculations
- **How it works**: Feeds text through a language model and measures "surprise" at each token
- **AI signature**: Low perplexity (0.3-0.5 repeat ratio in bigrams)
- **Human signature**: High perplexity (0.05-0.2 repeat ratio)
- **Enhanced detection**: Trigram analysis + Shannon entropy calculation

#### Burstiness
- **What it measures**: Sentence length variation (coefficient of variation)
- **How it works**: Calculates standard deviation / mean of sentence lengths
- **AI signature**: Low variance (CV 0.15-0.35) — very consistent
- **Human signature**: High variance (CV 0.4-0.8) — erratic rhythm

#### Vocabulary Richness
- **What it measures**: Type-token ratio (TTR) and hapax legomena
- **How it works**: Unique words / total words, plus words appearing only once
- **AI signature**: TTR 0.35-0.5, hapax 0.25-0.4
- **Human signature**: TTR 0.5-0.7, hapax 0.4-0.6

#### Semantic Coherence (NEW)
- **What it measures**: Topic consistency across sentences
- **How it works**: Lexical overlap between adjacent sentences
- **AI signature**: 0.25-0.4 overlap (unnaturally coherent)
- **Human signature**: 0.1-0.25 overlap (tangential, digressive)

#### Syntactic Complexity (NEW)
- **What it measures**: Parse tree depth via clause markers
- **How it works**: Counts subordinating conjunctions, relative pronouns, commas
- **AI signature**: 1-3 complexity score (simple structures)
- **Human signature**: 2-6 complexity score (nested clauses)

### 2. Pattern Matching

#### Tier 1 Patterns (Dead Giveaways)
- Vocabulary: "delve", "tapestry", "navigate the landscape", "harness potential"
- Sycophancy: "great question", "absolutely", "you're right"
- Chatbot artifacts: "I hope this helps", "as an AI", "let me know if"
- Structure: "in today's rapidly evolving", "plays a crucial role"
- Hedging: "it is important to note that", "one might argue"

#### Tier 2 Patterns (Suspicious)
- Corporate jargon: "synergy", "leverage", "streamline", "robust"
- Passive voice overuse: "is being utilized", "can be seen"
- Symmetrical structures: "not only...but also", "on one hand...on the other"

#### Tier 3 Patterns (Weak Signals)
- Formal connectors: "furthermore", "moreover", "nevertheless"
- Academic vocabulary: "multifaceted", "holistic", "nuanced"

### 3. Classifier-Based Detection

Modern detectors (GPTZero, Turnitin, Originality.ai) use:
- Fine-tuned transformer models trained on human vs AI corpora
- Sentence-level embedding analysis
- Ensemble methods combining multiple signals

## Adversarial Evasion Techniques

### Layer 1: Persona Injection
- **Technique**: Rewrite using distinct human personas (blogger, journalist, researcher)
- **Target**: Disrupts stylometric fingerprinting
- **Implementation**: LLM rewrite with persona-specific system prompts
- **Effectiveness**: High against pattern matchers, medium against statistical

### Layer 2: Recursive Paraphrasing
- **Technique**: Pass through multiple different models
- **Target**: Removes model-specific watermarks
- **Implementation**: Llama 3.3 70B → Llama 3.1 8B
- **Effectiveness**: High against single-model detectors

### Layer 3: Token Perturbation
- **Technique**: Replace high-probability words with rare synonyms
- **Target**: Shifts token probability distribution
- **Implementation**: Synonym mapping with low-frequency alternatives
- **Effectiveness**: Medium-high against perplexity analysis

### Layer 3.5: Embedding Space Perturbation (NEW)
- **Technique**: Inject rare but valid words to shift sentence embeddings
- **Target**: Classifier-based detectors using embedding centroids
- **Implementation**: Domain-specific adverbs inserted at random positions
- **Effectiveness**: High against embedding-based classifiers

### Layer 4: Structural Evasion
- **Technique**: Break symmetry, vary sentence length wildly
- **Target**: Burstiness and structural uniformity detection
- **Implementation**: Random sentence splitting/merging, fragment injection
- **Effectiveness**: High against burstiness analysis

### Layer 5: Post-Processing
- **Technique**: Force contractions, remove AI phrases
- **Target**: Pattern matchers and contraction rate analysis
- **Implementation**: Regex replacement + banned word filtering
- **Effectiveness**: High against pattern detection

## Advanced Attack Vectors (For Defensive Understanding)

### TokenBreak Attack
- **Method**: Single-character Unicode substitutions
- **Example**: Replace 'a' with Cyrillic 'а' (visually identical)
- **Impact**: Breaks tokenization, evades embedding analysis
- **Detection**: Unicode normalization, homoglyph detection
- **Status**: Implemented but disabled by default (ethical considerations)

### Adversarial Perturbations
- **Method**: Character-level noise injection
- **Example**: Zero-width spaces, invisible characters
- **Impact**: Disrupts token boundaries
- **Detection**: Whitespace normalization, character filtering
- **Status**: Not implemented (unethical for production use)

## Detector Comparison (2026 Research)

### GPTZero
- **Strengths**: Claude detection, fast processing
- **Weaknesses**: Inconsistent scoring, high false positives
- **Bypass difficulty**: Medium

### Turnitin
- **Strengths**: ChatGPT detection, mixed-content analysis
- **Weaknesses**: Not available to individuals, expensive
- **Bypass difficulty**: High

### Originality.ai
- **Strengths**: Comprehensive scoring, API access
- **Weaknesses**: Different thresholds than competitors
- **Bypass difficulty**: Medium-high

### Key Finding
Different detectors look for overlapping but distinct signals. Text scoring 2% on GPTZero might score 45% on Originality.ai. Multi-detector evasion requires addressing all signal types simultaneously.

## Defensive Recommendations

### For Detector Developers
1. **Multi-signal fusion**: Combine statistical + pattern + classifier approaches
2. **Adversarial training**: Train on humanized AI text, not just raw LLM output
3. **Ensemble methods**: Use multiple models with different architectures
4. **Unicode normalization**: Detect and normalize homoglyphs
5. **Temporal analysis**: Track writing speed and edit patterns (not just final text)

### For Content Platforms
1. **Probabilistic scoring**: Report confidence intervals, not binary classifications
2. **Human review**: Use detectors as flags, not final judgments
3. **Context awareness**: Consider domain, author history, submission patterns
4. **Transparency**: Explain detection methodology to reduce gaming

### For Researchers
1. **Benchmark diversity**: Test on multiple detectors, not just one
2. **Adversarial datasets**: Publish humanized AI text for training
3. **Ethical guidelines**: Distinguish defensive research from malicious evasion
4. **Open science**: Share detection methods to improve collective defenses

## Ethical Considerations

This system demonstrates evasion techniques for **security research only**:
- ✅ Understanding attack vectors to build better defenses
- ✅ Academic research on detector robustness
- ✅ Testing detection systems in controlled environments
- ❌ Academic dishonesty or plagiarism
- ❌ Misinformation campaigns
- ❌ Violating platform terms of service

## Implementation Notes

### What's Included
- Enhanced perplexity (trigram + entropy)
- Semantic coherence analysis
- Syntactic complexity detection
- Expanded pattern library (40+ patterns)
- Embedding space perturbation
- Multi-layer adversarial rewriting

### What's Excluded (Ethical Reasons)
- Homoglyph substitution (implemented but disabled)
- Invisible character injection
- Adversarial Unicode attacks
- Watermark removal techniques

## References

Content rephrased for compliance with licensing restrictions:

- AI detectors analyze statistical patterns like perplexity and burstiness to estimate generation probability ([source](https://thehumanizeai.pro/articles/how-does-ai-detection-work-2026))
- Token-level perturbations can induce misclassification in text classifiers ([source](https://arxiv.org/html/2506.07948v1))
- Different detectors show significant scoring variance on identical text ([source](https://humanizethisai.com/blog/pass-all-ai-detectors))
- Diffusion-generated texts closely mimic human perplexity and burstiness patterns ([source](https://arxiv.org/html/2507.10475))

## Future Research Directions

1. **Watermarking**: Investigate robust watermarking schemes resistant to paraphrasing
2. **Behavioral analysis**: Detect AI usage through writing process, not just output
3. **Multimodal detection**: Combine text analysis with metadata signals
4. **Federated learning**: Train detectors on distributed datasets without privacy leaks
5. **Adversarial robustness**: Develop provably robust detection methods

---

**Last Updated**: April 2026  
**Version**: 2.0  
**License**: Educational and research use only
