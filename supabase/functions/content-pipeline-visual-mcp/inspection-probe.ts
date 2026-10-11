const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAHgAAAA8CAIAAAAiz+n/AAAApElEQVR4nO3QwRHAIBADsZDK6Ry62HsgNeDxrvPNWHtoeM88/kdWHyR0ROiI0BGhI0JHhI4IHRE6InRE6IjQEaEjQkeEjggdEToidEToiNARoSNCR4SOCB0ROiJ0ROiI0BGhI0JHhI4IHRE6InRE6IjQEaEjQkeEjggdEToidEToiNARoSNCR4SOCB0ROiJ0ROiI0BGhI0JHhI4IHRE6InRE6MgFDvsDd7kXcKoAAAAASUVORK5CYII=';
export async function deliveryProbe() {
 const bytes = Uint8Array.from(atob(PNG), c => c.charCodeAt(0));
 const sha256 = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)), x => x.toString(16).padStart(2,"0")).join("");
 return {bytes,sha256};
}
