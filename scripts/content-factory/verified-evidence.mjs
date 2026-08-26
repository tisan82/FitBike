function unique(values) {
  return [...new Set(values.filter((value) => value !== null && value !== undefined && value !== ""))];
}

function claim({ name, value, table, model, yearRange, verification = "VERIFIED" }) {
  return { source_type: "FITBIKE_VERIFIED_DATA", table, model, year_range: yearRange ?? null, claim: `${name} = ${value}`, name, value, verification };
}
function detectClaimConflicts(claims) {
  const groups = new Map();
  for (const item of claims.filter((entry) => !entry.name.includes("compatible_"))) {
    const key = `${item.year_range ?? "UNKNOWN"}:${item.name}`;
    if (!groups.has(key)) groups.set(key, new Set());
    groups.get(key).add(String(item.value));
  }
  return [...groups.entries()].filter(([, values]) => values.size > 1).map(([key, values]) => ({ key, values: [...values], reason: "SOURCE_CONFLICT" }));
}

async function resolveFitBikeEvidence({ readEvidence, modelKey, partType }) {
  const models = await readEvidence(`select b.bike_model_id,b.model_key,b.model_name_en,b.model_name_ko,br.brand_key,br.brand_en,br.brand_ko from public."02_bike_model" b join public."01_brand" br on br.brand_id=b.brand_id and br.is_active=true where b.model_key=$1 and b.is_active=true;`, [modelKey]);
  if (models.length !== 1) return { status: "UNVERIFIED", sourceType: "FITBIKE_VERIFIED_DATA", identity: null, claims: [], missing: [`active bike model: ${modelKey}`], conflicts: [] };
  const model = models[0];
  const years = await readEvidence(`select bike_model_year_id,model_year_key,year_range_label,start_year,end_year,generation_key,generation_name,front_tire_full_size,front_tire_tube_type,rear_tire_full_size,rear_tire_tube_type,battery_standard_code,battery_voltage,front_brake_spec,rear_brake_spec from public."03_bike_model_year" where bike_model_id=$1 and is_active=true order by start_year,bike_model_year_id;`, [model.bike_model_id]);
  const identity = { brandKey: model.brand_key, brand: model.brand_ko || model.brand_en, modelKey: model.model_key, model: model.model_name_ko || model.model_name_en, generations: unique(years.map((year) => year.generation_name || year.generation_key)), yearRanges: unique(years.map((year) => year.year_range_label)) };
  const claims = [];
  const missing = [];
  const conflicts = [];
  if (years.length === 0) missing.push(`active model years: ${modelKey}`);

  if (partType === "TIRE") {
    for (const year of years) {
      if (year.front_tire_full_size) claims.push(claim({ name: "front_tire_size", value: year.front_tire_full_size, table: "03_bike_model_year", model: identity.model, yearRange: year.year_range_label }));
      else missing.push(`${year.year_range_label}: front_tire_size`);
      if (year.rear_tire_full_size) claims.push(claim({ name: "rear_tire_size", value: year.rear_tire_full_size, table: "03_bike_model_year", model: identity.model, yearRange: year.year_range_label }));
      else missing.push(`${year.year_range_label}: rear_tire_size`);
      if (year.front_tire_tube_type) claims.push(claim({ name: "front_tire_tube_type", value: year.front_tire_tube_type, table: "03_bike_model_year", model: identity.model, yearRange: year.year_range_label }));
      if (year.rear_tire_tube_type) claims.push(claim({ name: "rear_tire_tube_type", value: year.rear_tire_tube_type, table: "03_bike_model_year", model: identity.model, yearRange: year.year_range_label }));
    }
    const mappings = await readEvidence(`select y.bike_model_year_id,y.year_range_label,m.position_type,m.match_type,p.tire_product_key,p.brand_name,p.product_name,p.tire_size_full,p.tube_type from public."03_bike_model_year" y join public."07_bike_model_year_tire_product" m on m.bike_model_year_id=y.bike_model_year_id and m.is_active=true join public."04_tire_product" p on p.tire_product_id=m.tire_product_id and p.is_active=true where y.bike_model_id=$1 and y.is_active=true order by y.start_year,m.position_type,m.display_order;`, [model.bike_model_id]);
    claims.push(...mappings.map((row) => claim({ name: `${String(row.position_type).toLowerCase()}_compatible_tire`, value: row.tire_product_key, table: "07_bike_model_year_tire_product", model: identity.model, yearRange: row.year_range_label })));
  } else if (partType === "BATTERY") {
    for (const year of years) {
      if (year.battery_standard_code) claims.push(claim({ name: "battery_standard_code", value: year.battery_standard_code, table: "03_bike_model_year", model: identity.model, yearRange: year.year_range_label }));
      else missing.push(`${year.year_range_label}: battery_standard_code`);
      if (year.battery_voltage) claims.push(claim({ name: "battery_voltage", value: year.battery_voltage, table: "03_bike_model_year", model: identity.model, yearRange: year.year_range_label }));
    }
    const mappings = await readEvidence(`select distinct y.year_range_label,y.battery_standard_code,m.match_type,p.battery_part_key,p.brand_name,p.spec_code,p.voltage from public."03_bike_model_year" y join public."08_battery_standard_product" m on m.battery_standard_code=y.battery_standard_code and m.is_active=true join public."05_battery_product" p on p.battery_product_id=m.battery_product_id and p.is_active=true where y.bike_model_id=$1 and y.is_active=true order by y.year_range_label,p.battery_part_key;`, [model.bike_model_id]);
    claims.push(...mappings.map((row) => claim({ name: "compatible_battery", value: row.battery_part_key, table: "08_battery_standard_product", model: identity.model, yearRange: row.year_range_label })));
    claims.push(...mappings.filter((row) => row.voltage).map((row) => claim({ name: "battery_voltage", value: row.voltage, table: "05_battery_product", model: identity.model, yearRange: row.year_range_label })));
    for (const code of unique(years.map((year) => year.battery_standard_code))) if (!mappings.some((row) => row.battery_standard_code === code)) missing.push(`battery mapping: ${code}`);
    if (!claims.some((item) => item.name === "battery_voltage")) missing.push(`battery voltage: ${modelKey}`);
  } else if (partType === "BRAKE") {
    const mappings = await readEvidence(`select y.year_range_label,m.position_type,m.match_type,p.brake_product_key,p.brand_name,p.product_name,p.brake_type,p.compatible_code from public."03_bike_model_year" y join public."09_bike_model_year_brake_product" m on m.bike_model_year_id=y.bike_model_year_id and m.is_active=true join public."06_brake_product" p on p.brake_product_id=m.brake_product_id and p.is_active=true where y.bike_model_id=$1 and y.is_active=true order by y.start_year,m.position_type,m.display_order;`, [model.bike_model_id]);
    claims.push(...mappings.map((row) => claim({ name: `${String(row.position_type).toLowerCase()}_compatible_brake`, value: row.brake_product_key, table: "09_bike_model_year_brake_product", model: identity.model, yearRange: row.year_range_label })));
    if (mappings.length === 0) missing.push(`brake product relation: ${modelKey}`);
  }

  conflicts.push(...detectClaimConflicts(claims));
  const status = conflicts.length ? "CONFLICT" : missing.length || claims.length === 0 ? "UNVERIFIED" : "VERIFIED";
  return { status, sourceType: "FITBIKE_VERIFIED_DATA", identity, years, claims, missing, conflicts, coverage: { criticalClaims: claims.length + missing.length, verified: claims.length, partial: 0, unverified: missing.length, conflict: conflicts.length, factGate: status === "VERIFIED" ? "PASS" : "HOLD" } };
}

export { detectClaimConflicts, resolveFitBikeEvidence };
