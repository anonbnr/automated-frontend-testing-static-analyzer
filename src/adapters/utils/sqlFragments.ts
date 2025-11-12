"use strict";

export function sqlUpdateFragmentFromObject(obj: Record<string, unknown>) {
	let sql = "";
	const values = [];

	for(const key in obj) {
		if(obj[key] === undefined)
			continue;
		sql += key + "=?, ";
		values.push(obj[key]);
    }

    return {sql: sql.slice(0, -2),
        values
    };
}

export function patternUnion(dbField: string, string: string) {
	const chunks = string.split(" ");
	let sql = "";

	// for(const i in chunks) {
    for (let i = 0; i < chunks.length; i++) {
		if(i > 0)
			sql += " OR ";

		sql += dbField + " LIKE '%"+chunks[i]+"%' ";
	}

	return sql;
}
