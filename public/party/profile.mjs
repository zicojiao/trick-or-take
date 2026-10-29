const words = {
  en: [['Sneaky','Sleepy','Lucky','Tiny','Spooky','Dizzy','Bouncy','Happy'],['Ghost','Pumpkin','Mochi','Bat','Witch','Cookie','Kitten','Goblin']],
  zh: [['糯糯','偷偷','迷糊','勇敢','贪吃','开心','圆滚滚','甜甜'],['小南瓜','小幽灵','小蝙蝠','糯米团','小黑猫','糖果精','小布丁','小饼干']],
  'zh-tw': [['糯糯','偷偷','迷糊','勇敢','貪吃','開心','圓滾滾','甜甜'],['小南瓜','小幽靈','小蝙蝠','糯米糰','小黑貓','糖果精','小布丁','小餅乾']],
  es: [['Pillo','Listo','Chico','Pícaro','Ágil','Feliz','Veloz','Dulce'],['Fantasma','Calabaza','Murciélago','Brujito','Galleta','Gatito','Duende','Caramelo']],
  ja: [['いたずら','ねぼすけ','ちびっこ','おばけ','くいしんぼう','ごきげん','ふわふわ','すばやい'],['ゴースト','カボチャ','コウモリ','モチ','こねこ','キャンディ','クッキー','まほうつかい']],
  ko: [['장난꾸러기','졸린','꼬마','유령','욕심쟁이','행복한','말랑한','재빠른'],['고스트','호박','박쥐','모찌','고양이','캔디','쿠키','마법사']],
  fr: [['Malin','Gris','Petit','Fou','Joyeux','Gourmet','Agile','Doux'],['Fantôme','Citrouille','Chauve','Mochi','Chaton','Bonbon','Biscuit','Lutin']],
  de: [['Frecher','Müder','Kleiner','Lustiger','Flinker','Süßer','Flotter','Schlauer'],['Geist','Kürbis','Mausgeist','Mochi','Kätzchen','Bonbon','Keks','Kobold']],
  pt: [['Travesso','Esperto','Pequeno','Ágil','Feliz','Guloso','Rápido','Doce'],['Fantasma','Abóbora','Morcego','Mochi','Gatinho','Doce','Biscoito','Duende']],
  ru: [['Хитрый','Сонный','Милый','Жуткий','Смелый','Шустрый','Сладкий','Ловкий'],['Призрак','Тыквёнок','Мышонок','Моти','Котёнок','Леденец','Пряник','Гоблин']],
  it: [['Furbo','Pigro','Piccolo','Buffo','Allegro','Vispo','Dolce','Lesto'],['Spettro','Zucca','Gattino','Mochi','Folletto','Caramella','Biscotto','Elfo']],
  id: [['Cerdik','Ngantuk','Mungil','Seram','Ceria','Lahap','Lincah','Manis'],['Hantu','Labu','Kelelawar','Mochi','Kucing','Permen','Biskuit','Goblin']],
};
const pools = Object.fromEntries(Object.entries(words).map(([lang,[adjectives,nouns]])=>[
  lang,adjectives.flatMap(a=>nouns.map(n=>a+(['zh','zh-tw','ja'].includes(lang)?'':' ')+n)),
]));

/** Skip the current name rather than retrying, so every click changes it. */
export function randomNickname(lang,previous='',random=()=>crypto.getRandomValues(new Uint32Array(1))[0]) {
  const pool=pools[lang]||pools.en,previousIndex=pool.indexOf(previous.trim());
  let index=random()%(pool.length-(previousIndex>=0?1:0));
  if(previousIndex>=0&&index>=previousIndex)index++;
  return pool[index];
}
