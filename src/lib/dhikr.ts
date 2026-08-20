export type Dhikr = {
  id: string;
  arabic: string;
  translit: string;
  meaning: string;
};

/**
 * The rotation, in order. Every phone in the hall shows the same entry at the
 * same time; the sequence is snapshotted onto the game row at creation, so
 * editing this list only affects games created afterwards.
 */
export const ADHKAR: Dhikr[] = [
  {
    id: "subhanallah",
    arabic: "سُبْحَانَ ٱللَّٰهِ",
    translit: "SubhanAllah",
    meaning: "Glory be to Allah",
  },
  {
    id: "alhamdulillah",
    arabic: "ٱلْحَمْدُ لِلَّٰهِ",
    translit: "Alhamdulillah",
    meaning: "All praise is due to Allah",
  },
  {
    id: "allahuakbar",
    arabic: "ٱللَّٰهُ أَكْبَرُ",
    translit: "Allahu Akbar",
    meaning: "Allah is the Greatest",
  },
  {
    id: "tahlil",
    arabic: "لَا إِلَٰهَ إِلَّا ٱللَّٰهُ",
    translit: "La ilaha illa Allah",
    meaning: "There is no god but Allah",
  },
  {
    id: "istighfar",
    arabic: "أَسْتَغْفِرُ ٱللَّٰهَ",
    translit: "Astaghfirullah",
    meaning: "I seek forgiveness from Allah",
  },
  {
    id: "salawat",
    arabic: "ٱللَّٰهُمَّ صَلِّ عَلَىٰ مُحَمَّدٍ",
    translit: "Allahumma salli ala Muhammad",
    meaning: "O Allah, send blessings upon Muhammad ﷺ",
  },
  {
    id: "sallallahu",
    arabic: "صَلَّى ٱللَّٰهُ عَلَيْهِ وَسَلَّمَ",
    translit: "Sallallahu alayhi wa sallam",
    meaning: "May Allah send blessings and peace upon him",
  },
  {
    id: "hawqala",
    arabic: "لَا حَوْلَ وَلَا قُوَّةَ إِلَّا بِٱللَّٰهِ",
    translit: "La hawla wa la quwwata illa billah",
    meaning: "There is no might nor power except with Allah",
  },
];

export function dhikrById(id: string) {
  return ADHKAR.find((d) => d.id === id) ?? ADHKAR[0];
}
