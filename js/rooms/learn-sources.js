// Learn room: every source the chapters lean on, with a plain-language line.
// Only well-established, published works. `ch` lists the chapters that use it.

export const SOURCES = {
  siegel1999: {
    who: 'Siegel, D. J.', year: 1999, title: 'The Developing Mind: Toward a Neurobiology of Interpersonal Experience', outlet: 'Guilford Press',
    plain: 'Where the idea of the window of tolerance comes from.', ch: ['window'],
  },
  ogden2006: {
    who: 'Ogden, P., Minton, K., & Pain, C.', year: 2006, title: 'Trauma and the Body: A Sensorimotor Approach to Psychotherapy', outlet: 'W. W. Norton',
    plain: 'How trauma shows up in the body, and how therapy works with the zones above and below the window.', ch: ['window', 'return'],
  },
  vanderkolk2014: {
    who: 'van der Kolk, B.', year: 2014, title: 'The Body Keeps the Score: Brain, Mind, and Body in the Healing of Trauma', outlet: 'Viking',
    plain: 'The smoke detector and watchtower metaphors, and how trauma changes the alarm.', ch: ['alarm', 'trauma'],
  },
  arnsten2009: {
    who: 'Arnsten, A. F. T.', year: 2009, title: 'Stress signalling pathways that impair prefrontal cortex structure and function', outlet: 'Nature Reviews Neuroscience, 10(6), 410–422',
    plain: 'Stress chemistry can quickly take the planning part of the brain offline.', ch: ['alarm'],
  },
  yoo2007: {
    who: 'Yoo, S.-S., Gujar, N., Hu, P., Jolesz, F. A., & Walker, M. P.', year: 2007, title: 'The human emotional brain without sleep — a prefrontal amygdala disconnect', outlet: 'Current Biology, 17(20), R877–R878',
    plain: 'After a night without sleep, the alarm reacted about 60% more to upsetting pictures, and its link to the planner was weaker.', ch: ['alarm'],
  },
  shaw2014: {
    who: 'Shaw, P., Stringaris, A., Nigg, J., & Leibenluft, E.', year: 2014, title: 'Emotion dysregulation in attention deficit hyperactivity disorder', outlet: 'American Journal of Psychiatry, 171(3), 276–293',
    plain: 'Big, fast emotions that are hard to steer are a common part of ADHD.', ch: ['alarm'],
  },
  ledoux2015: {
    who: 'LeDoux, J.', year: 2015, title: 'Anxious: Using the Brain to Understand and Treat Fear and Anxiety', outlet: 'Viking',
    plain: 'Why “the amygdala is the fear centre” is too simple a story.', ch: ['alarm', 'sources'],
  },
  who2019: {
    who: 'World Health Organization', year: 2019, title: 'International Classification of Diseases, 11th Revision (ICD-11): 6B41 Complex post traumatic stress disorder', outlet: 'WHO',
    plain: 'The official definition of complex PTSD.', ch: ['trauma'],
  },
  cloitre2013: {
    who: 'Cloitre, M., Garvert, D. W., Brewin, C. R., Bryant, R. A., & Maercker, A.', year: 2013, title: 'Evidence for proposed ICD-11 PTSD and complex PTSD: a latent profile analysis', outlet: 'European Journal of Psychotraumatology, 4',
    plain: 'Early evidence that complex PTSD is a distinct pattern, not just “more PTSD”.', ch: ['trauma'],
  },
  cloitre2012: {
    who: 'Cloitre, M., Courtois, C. A., Ford, J. D., et al.', year: 2012, title: 'The ISTSS Expert Consensus Treatment Guidelines for Complex PTSD in Adults', outlet: 'International Society for Traumatic Stress Studies',
    plain: 'Why many clinicians build safety and stability first.', ch: ['trauma'],
  },
  nice2018: {
    who: 'National Institute for Health and Care Excellence', year: 2018, title: 'Post-traumatic stress disorder (NICE guideline NG116)', outlet: 'NICE',
    plain: 'UK guideline. Recommends trauma-focused CBT and EMDR for PTSD in adults.', ch: ['trauma'],
  },
  istss2018: {
    who: 'International Society for Traumatic Stress Studies', year: 2018, title: 'Posttraumatic Stress Disorder Prevention and Treatment Guidelines: Methodology and Recommendations', outlet: 'ISTSS',
    plain: 'International guideline. Strong support for trauma-focused therapies, including EMDR.', ch: ['trauma'],
  },
  brom2017: {
    who: 'Brom, D., Stokar, Y., Lawi, C., et al.', year: 2017, title: 'Somatic Experiencing for posttraumatic stress disorder: a randomized controlled outcome study', outlet: 'Journal of Traumatic Stress, 30(3), 304–312',
    plain: 'One early trial of a body-based therapy. Promising, and more research is needed.', ch: ['trauma'],
  },
  giedd1999: {
    who: 'Giedd, J. N., Blumenthal, J., Jeffries, N. O., et al.', year: 1999, title: 'Brain development during childhood and adolescence: a longitudinal MRI study', outlet: 'Nature Neuroscience, 2(10), 861–863',
    plain: 'The front of the brain keeps maturing through childhood and the teen years.', ch: ['kid'],
  },
  berger2012: {
    who: 'Berger, R. H., Miller, A. L., Seifer, R., Cares, S. R., & LeBourgeois, M. K.', year: 2012, title: 'Acute sleep restriction effects on emotion responses in 30- to 36-month-old children', outlet: 'Journal of Sleep Research, 21(3), 235–246',
    plain: 'Toddlers who missed one nap showed more negative and less positive emotion.', ch: ['kid'],
  },
  greene1998: {
    who: 'Greene, R. W.', year: 1998, title: 'The Explosive Child', outlet: 'HarperCollins',
    plain: '“Kids do well if they can.” Meltdowns as lagging skills, not bad will.', ch: ['kid'],
  },
  siegelbryson2011: {
    who: 'Siegel, D. J., & Bryson, T. P.', year: 2011, title: 'The Whole-Brain Child', outlet: 'Delacorte Press',
    plain: 'Connect with the feeling first, then redirect.', ch: ['kid'],
  },
  tronick1989: {
    who: 'Tronick, E. Z.', year: 1989, title: 'Emotions and emotional communication in infants', outlet: 'American Psychologist, 44(2), 112–119',
    plain: 'Mismatches between parent and baby happen all the time. Repairing them is what matters.', ch: ['kid'],
  },
  balban2023: {
    who: 'Balban, M. Y., Neri, E., Kogon, M. M., et al.', year: 2023, title: 'Brief structured respiration practices enhance mood and reduce physiological arousal', outlet: 'Cell Reports Medicine, 4(1), 100895',
    plain: 'Five minutes a day of cyclic sighing improved mood and slowed resting breathing more than mindfulness meditation in this study.', ch: ['return'],
  },
  zaccaro2018: {
    who: 'Zaccaro, A., Piarulli, A., Laurino, M., et al.', year: 2018, title: 'How breath-control can change your life: a systematic review on psycho-physiological correlates of slow breathing', outlet: 'Frontiers in Human Neuroscience, 12, 353',
    plain: 'Slow breathing is linked to a calmer heart and nervous system.', ch: ['return'],
  },
  nagoski2019: {
    who: 'Nagoski, E., & Nagoski, A.', year: 2019, title: 'Burnout: The Secret to Unlocking the Stress Cycle', outlet: 'Ballantine Books',
    plain: 'Stress is a cycle the body needs to finish: movement, breath, hugs, laughter, a good cry.', ch: ['return'],
  },
  coan2006: {
    who: 'Coan, J. A., Schaefer, H. S., & Davidson, R. J.', year: 2006, title: 'Lending a hand: social regulation of the neural response to threat', outlet: 'Psychological Science, 17(12), 1032–1039',
    plain: 'Holding a trusted person’s hand calmed the brain’s response to threat.', ch: ['return'],
  },
  neff2003: {
    who: 'Neff, K. D.', year: 2003, title: 'Self-compassion: an alternative conceptualization of a healthy attitude toward oneself', outlet: 'Self and Identity, 2(2), 85–101',
    plain: 'Self-compassion’s three parts: mindfulness, common humanity, self-kindness.', ch: ['spirit'],
  },
  hofmann2011: {
    who: 'Hofmann, S. G., Grossman, P., & Hinton, D. E.', year: 2011, title: 'Loving-kindness and compassion meditation: potential for psychological interventions', outlet: 'Clinical Psychology Review, 31(7), 1126–1132',
    plain: 'What research says about loving-kindness practice: more positive feeling, less negative.', ch: ['spirit'],
  },
  salzberg1995: {
    who: 'Salzberg, S.', year: 1995, title: 'Lovingkindness: The Revolutionary Art of Happiness', outlet: 'Shambhala',
    plain: 'A gentle, non-religious guide to the loving-kindness phrases.', ch: ['spirit'],
  },
  chodron1997: {
    who: 'Chödrön, P.', year: 1997, title: 'When Things Fall Apart: Heart Advice for Difficult Times', outlet: 'Shambhala',
    plain: 'Buddhist teacher. “You are the sky…” is widely attributed to her teaching.', ch: ['spirit'],
  },
  porges2011: {
    who: 'Porges, S. W.', year: 2011, title: 'The Polyvagal Theory: Neurophysiological Foundations of Emotions, Attachment, Communication, and Self-regulation', outlet: 'W. W. Norton',
    plain: 'The original polyvagal theory: safety, fight/flight and shutdown.', ch: ['sources'],
  },
  grossman2023: {
    who: 'Grossman, P.', year: 2023, title: 'Fundamental challenges and likely refutations of the five basic premises of the polyvagal theory', outlet: 'Biological Psychology, 180, 108589',
    plain: 'A critique: several of polyvagal theory’s physiological claims don’t hold up.', ch: ['sources'],
  },
};

export const sourcesFor = (chapterId) =>
  Object.entries(SOURCES).filter(([, s]) => s.ch.includes(chapterId)).map(([id, s]) => ({ id, ...s }));

export const allSources = () =>
  Object.entries(SOURCES).map(([id, s]) => ({ id, ...s })).sort((a, b) => a.who.localeCompare(b.who, 'en', { sensitivity: 'base' }) || a.year - b.year);
