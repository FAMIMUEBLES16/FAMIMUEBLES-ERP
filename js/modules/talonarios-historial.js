const rows = [
  ['2026',13251,13300,'Local 7'],['2026',13301,13350,'Local Manablanca'],['2026',13351,13400,'Local Leidy'],['2026',13401,13450,'Local Nathaly'],['2026',13451,13500,'Local Cartagenita'],['2026',13501,13550,'Local Leidy'],['2026',13551,13600,'Local Jose'],['2026',13601,13650,'Local Nathaly'],['2026',13651,13700,'Local Cr 5 #3-26'],['2026',13701,13750,'Local Cartagenita'],['2026',13751,13800,'Local Manablanca'],['2026',13801,13850,'Local Leidy'],['2026',13851,13900,'Local Manablanca'],['2026',13901,13950,'Local Tejidos'],['2026',13951,14000,'Local Septima'],['2026',14001,14050,'Local Cartagenita'],['2026',14051,14100,'Local Esquina'],['2026',14101,14150,'Local Leidy'],['2026',14151,14200,'Local Nathaly'],['2026',14201,14250,'Local Cr 5 #3-26'],['2026',14251,14300,'Local Cartagenita'],['2026',14301,14350,'Local Septima'],['2026',14351,14400,'Local Leidy'],['2026',14401,14450,'Local Manablanca'],['2026',14451,14500,'Local Cartagenita'],['2026',14501,14550,'Local Cr 5 #3-26'],['2026',14551,14600,'Local Leidy'],['2026',14601,14650,'Local Manablanca'],['2026',14651,14700,'Local Cr 5 #5 Sur'],['2026',14701,14750,'Local Cartagenita'],['2026',14751,14800,'Local Cr 7 #6A-15'],['2026',14801,14850,'Local Cr 5 #3-26'],['2026',14851,14900,'Local Cr 5 #3-54'],['2026',14901,14950,'Local Manablanca'],['2026',14951,15000,'Local Cartagenita'],['2026',15001,15050,'Local Cr 5 #3-54'],['2026',15051,15100,'Local Cartagenita'],['2026',15101,15150,'Local Manablanca'],['2026',15151,15200,'Local Cr 7 #6A-15'],['2026',15201,15250,'Local Angelica'],['2026-07-19',15251,15300,'Local Angelica'],['2026-07-24',15301,15350,'Cr 5 #3-26'],['2026-07-30',15351,15400,'Manablanca'],['2026-08-01',15401,15450,'Cartagenita'],['2026-08-05',15451,15500,'Cartagenita / Vital'],['2026-08-08',15501,15550,'Cr 5 - Sur'],['2026-08-19',15551,15600,'Manablanca'],['2026-08-08',15601,15650,'Cr 5 - 56'],['2026-08-08',15651,15700,'Cr 7 #6A-15']
];

const receiptRows = [
  ['2026',5201,5250,'Cr 5 #3-26'],['2026',5251,5300,'Leidy'],['2026',5301,5350,'Nathaly'],['2026',5351,5400,'Cartagenita'],['2026',5401,5450,'Manablanca'],['2026',5451,5500,'Cr 5 #5-51'],['2026',5501,5550,'Angelica'],['2026',5551,5600,'Vitaliano'],['2026',5601,5650,'Manablanca'],['2026',5651,5700,'Cr 5 -3-26']
];

const storedRows = [
  ['REMISION',15701,15750],['REMISION',15751,15800],['REMISION',15801,15850],
  ['RECIBO',5701,5750],['RECIBO',5751,5800],['RECIBO',5801,5850],['RECIBO',5851,5900],['RECIBO',5901,5950],['RECIBO',5951,6000],['RECIBO',6001,6050],['RECIBO',6051,6100],['RECIBO',6101,6150],['RECIBO',6151,6200],['RECIBO',6201,6250],['RECIBO',6251,6300],['RECIBO',6301,6350],['RECIBO',6351,6400],['RECIBO',6401,6450],['RECIBO',6451,6500]
];

export const historicalTalonarios = rows.map(([date, startNumber, endNumber, destinationName]) => ({
  id: `TAL-HIST-${startNumber}`,
  type: 'REMISION',
  startNumber,
  endNumber,
  currentNumber: startNumber === 15301 ? 15347 : endNumber,
  storeId: startNumber === 15301 ? 'INV CRR 5 3 26' : destinationName,
  destinationName: startNumber === 15301 ? 'INV CRR 5 3 26' : destinationName,
  status: startNumber === 15301 ? 'EN_USO' : 'ENVIADO',
  sentFrom: 'INV CRR 5 3 26',
  sentAt: date.length === 4 ? `${date}-01-01T00:00:00.000Z` : `${date}T00:00:00.000Z`,
  historicalDate: date,
  historical: true
}));

export const historicalRecibos = receiptRows.map(([date, startNumber, endNumber, destinationName]) => ({
  id: `TAL-HIST-REC-${startNumber}`,
  type: 'RECIBO',
  startNumber,
  endNumber,
  currentNumber: endNumber,
  storeId: destinationName,
  destinationName,
  status: 'ENVIADO',
  sentFrom: 'INV CRR 5 3 26',
  sentAt: `${date}-01-01T00:00:00.000Z`,
  historicalDate: date,
  historical: true
}));

export const storedTalonarios = storedRows.map(([type, startNumber, endNumber]) => ({
  id: `TAL-STOCK-${type}-${startNumber}`,
  type,
  startNumber,
  endNumber,
  currentNumber: startNumber,
  storeId: 'INV CRR 5 3 26',
  destinationName: 'INV CRR 5 3 26',
  status: 'ALMACENADO',
  stored: true
}));
