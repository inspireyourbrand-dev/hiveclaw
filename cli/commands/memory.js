/**
 * HiveClaw Memory CLI Commands
 *
 * Interact with HiveMem persistent memory from the command line.
 *
 * Usage:
 *   hiveclaw memory search <query>
 *   hiveclaw memory stats
 *   hiveclaw memory store "content" --tags tag1,tag2
 */

export default async function memory(args) {
  const subcommand = args[0];
  const port = process.env.HIVEMEM_PORT || process.env.OPENCLAW_GATEWAY_PORT || '18789';
  const host = process.env.OPENCLAW_GATEWAY_HOST || '127.0.0.1';
  const baseUrl = `http://${host}:${port}/api/v1/hivemem`;

  switch (subcommand) {
    case 'search': {
      const query = args.slice(1).join(' ');
      if (!query) {
        console.log('  Usage: hiveclaw memory search <query>');
        return;
      }

      try {
        const res = await fetch(`${baseUrl}/memories?q=${encodeURIComponent(query)}&limit=10`);
        const data = await res.json();

        console.log('');
        console.log(`  Memory search: "${query}"`);
        console.log(`  Found: ${data.total || data.memories?.length || 0} results`);
        console.log('');

        if (data.memories?.length > 0) {
          for (const m of data.memories) {
            console.log(`  [${m.id?.slice(0, 8)}] ${m.content?.slice(0, 120)}`);
            if (m.tags?.length > 0) console.log(`           tags: ${m.tags.join(', ')}`);
            console.log(`           ${m.created_at || m.created}`);
            console.log('');
          }
        } else {
          console.log('  No memories found matching that query.');
        }
      } catch {
        console.log('  Could not reach memory server. Is the gateway running?');
      }
      break;
    }

    case 'stats': {
      try {
        const res = await fetch(`${baseUrl}/stats`);
        const data = await res.json();

        console.log('');
        console.log('  HiveMem Statistics');
        console.log('  ------------------');
        console.log(`  Total memories:  ${data.totalMemories}`);
        console.log(`  Storage type:    ${data.storageType || data.storage}`);
        if (data.uptime) console.log(`  Uptime:          ${Math.floor(data.uptime)}s`);
        console.log('');
      } catch {
        console.log('  Could not reach memory server. Is the gateway running?');
      }
      break;
    }

    case 'store': {
      const content = args.slice(1).join(' ');
      if (!content) {
        console.log('  Usage: hiveclaw memory store "your memory content"');
        return;
      }

      try {
        const res = await fetch(`${baseUrl}/memories`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ content, tags: ['cli'], metadata: { source: 'cli' } }),
        });
        const data = await res.json();
        console.log(`  Memory stored: ${data.id}`);
      } catch {
        console.log('  Could not reach memory server. Is the gateway running?');
      }
      break;
    }

    default:
      console.log('');
      console.log('  hiveclaw memory <command>');
      console.log('');
      console.log('  Commands:');
      console.log('    search <query>    Search stored memories');
      console.log('    stats             Show memory statistics');
      console.log('    store "content"   Store a new memory');
      console.log('');
  }
}
