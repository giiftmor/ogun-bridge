import { Client } from 'ldapts';
export async function verifyPassword(username, password, options) {
    const client = new Client({
        url: options.url,
        timeout: options.timeout || 5000,
    });
    try {
        await client.bind(`uid=${username},cn=users,cn=accounts,dc=authentik`, password);
        return true;
    }
    catch {
        return false;
    }
    finally {
        await client.unbind();
    }
}
//# sourceMappingURL=client.js.map