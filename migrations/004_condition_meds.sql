-- أدوية كل مرض كما تكتبها العائلة: {"تضخم البروستاتا": "أومنك أوكاس 0.4"}
ALTER TABLE patients ADD COLUMN condition_meds TEXT;
