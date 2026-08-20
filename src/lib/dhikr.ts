export type Dhikr = {
  id: string;
  arabic: string;
  translit: string;
  meaning: string;
  /** Traditional count for one round, used for the round marker on the counter. */
  round: number;
};

export const ADHKAR: Dhikr[] = [
  {
    id: "subhanallah",
    arabic: "سُبْحَانَ ٱللَّٰهِ",
    translit: "SubhanAllah",
    meaning: "Glory be to Allah",
    round: 33,
  },
  {
    id: "alhamdulillah",
    arabic: "ٱلْحَمْدُ لِلَّٰهِ",
    translit: "Alhamdulillah",
    meaning: "All praise is due to Allah",
    round: 33,
  },
  {
    id: "allahuakbar",
    arabic: "ٱللَّٰهُ أَكْبَرُ",
    translit: "Allahu Akbar",
    meaning: "Allah is the Greatest",
    round: 34,
  },
  {
    id: "tahlil",
    arabic: "لَا إِلَٰهَ إِلَّا ٱللَّٰهُ",
    translit: "La ilaha illa Allah",
    meaning: "There is no god but Allah",
    round: 100,
  },
  {
    id: "istighfar",
    arabic: "أَسْتَغْفِرُ ٱللَّٰهَ",
    translit: "Astaghfirullah",
    meaning: "I seek forgiveness from Allah",
    round: 100,
  },
  {
    id: "salawat",
    arabic: "ٱللَّٰهُمَّ صَلِّ عَلَىٰ مُحَمَّدٍ",
    translit: "Allahumma salli ala Muhammad",
    meaning: "O Allah, send blessings upon Muhammad ﷺ",
    round: 100,
  },
  {
    id: "hawqala",
    arabic: "لَا حَوْلَ وَلَا قُوَّةَ إِلَّا بِٱللَّٰهِ",
    translit: "La hawla wa la quwwata illa billah",
    meaning: "There is no might nor power except with Allah",
    round: 100,
  },
];

export function dhikrById(id: string) {
  return ADHKAR.find((d) => d.id === id) ?? ADHKAR[0];
}
