import { readFile, readdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";

const ZIP_UINT16_MAX = 0xffff;
const ZIP_UINT32_MAX = 0xffffffff;
const DEFAULT_PORTABLE_ZIP_MAX_BYTES = 512 * 1024 * 1024;

function portableZipMaxBytes(): number {
  const raw = Number(process.env.THREADLENS_PORTABLE_ZIP_MAX_BYTES ?? "");
  if (Number.isFinite(raw) && raw > 0) {
    return Math.min(Math.floor(raw), ZIP_UINT32_MAX);
  }
  return DEFAULT_PORTABLE_ZIP_MAX_BYTES;
}

const CRC32_TABLE = new Uint32Array(256).map((_, index) => {
  let value = index;
  for (let bit = 0; bit < 8; bit += 1) {
    value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  }
  return value >>> 0;
});

function crc32(data: Buffer): number {
  let crc = 0xffffffff;
  for (const byte of data) {
    crc = CRC32_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function dosTimestamp(date: Date): { time: number; date: number } {
  const year = Math.max(1980, date.getFullYear());
  return {
    time: (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2),
    date: ((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate(),
  };
}

async function collectZipEntries(
  sourceDir: string,
  rootName = path.basename(sourceDir),
): Promise<Array<{ name: string; data: Buffer; mtime: Date; directory: boolean }>> {
  const entries: Array<{ name: string; data: Buffer; mtime: Date; directory: boolean }> = [];
  const maxTotalBytes = portableZipMaxBytes();
  let totalBytes = 0;
  const walk = async (absoluteDir: string, relativeDir: string) => {
    const dirStat = await stat(absoluteDir);
    const directoryName = `${relativeDir.replace(/\\/g, "/").replace(/\/?$/, "/")}`;
    if (Buffer.byteLength(directoryName, "utf8") > ZIP_UINT16_MAX) {
      throw new Error("portable-zip-entry-name-too-long");
    }
    entries.push({
      name: directoryName,
      data: Buffer.alloc(0),
      mtime: dirStat.mtime,
      directory: true,
    });
    const children = await readdir(absoluteDir, { withFileTypes: true });
    for (const child of children) {
      const childPath = path.join(absoluteDir, child.name);
      const childRelative = `${relativeDir}/${child.name}`.replace(/\\/g, "/");
      if (child.isDirectory()) {
        await walk(childPath, childRelative);
      } else if (child.isFile()) {
        const fileStat = await stat(childPath);
        if (fileStat.size > ZIP_UINT32_MAX) {
          throw new Error("portable-zip-entry-too-large");
        }
        totalBytes += fileStat.size;
        if (totalBytes > maxTotalBytes) {
          throw new Error("portable-zip-total-size-limit-exceeded");
        }
        if (Buffer.byteLength(childRelative, "utf8") > ZIP_UINT16_MAX) {
          throw new Error("portable-zip-entry-name-too-long");
        }
        entries.push({
          name: childRelative,
          data: await readFile(childPath),
          mtime: fileStat.mtime,
          directory: false,
        });
      }
    }
  };
  await walk(sourceDir, rootName || "recovery-export");
  if (entries.length > ZIP_UINT16_MAX) {
    throw new Error("portable-zip-entry-count-limit-exceeded");
  }
  return entries;
}

export async function writePortableZipArchive(
  sourceDir: string,
  archivePath: string,
) {
  const entries = await collectZipEntries(sourceDir);
  const localParts: Buffer[] = [];
  const centralParts: Buffer[] = [];
  let offset = 0;
  for (const entry of entries) {
    const name = Buffer.from(entry.name, "utf8");
    const { time, date } = dosTimestamp(entry.mtime);
    const checksum = crc32(entry.data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x0800, 6);
    local.writeUInt16LE(0, 8);
    local.writeUInt16LE(time, 10);
    local.writeUInt16LE(date, 12);
    local.writeUInt32LE(checksum, 14);
    local.writeUInt32LE(entry.data.length, 18);
    local.writeUInt32LE(entry.data.length, 22);
    local.writeUInt16LE(name.length, 26);
    local.writeUInt16LE(0, 28);
    localParts.push(local, name, entry.data);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0x0800, 8);
    central.writeUInt16LE(0, 10);
    central.writeUInt16LE(time, 12);
    central.writeUInt16LE(date, 14);
    central.writeUInt32LE(checksum, 16);
    central.writeUInt32LE(entry.data.length, 20);
    central.writeUInt32LE(entry.data.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt16LE(0, 30);
    central.writeUInt16LE(0, 32);
    central.writeUInt16LE(0, 34);
    central.writeUInt16LE(0, 36);
    central.writeUInt32LE(entry.directory ? 0x10 : 0, 38);
    central.writeUInt32LE(offset, 42);
    centralParts.push(central, name);
    offset += local.length + name.length + entry.data.length;
    if (offset > ZIP_UINT32_MAX) {
      throw new Error("portable-zip-archive-too-large");
    }
  }

  const centralDirectory = Buffer.concat(centralParts);
  if (centralDirectory.length > ZIP_UINT32_MAX) {
    throw new Error("portable-zip-central-directory-too-large");
  }
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(0, 4);
  end.writeUInt16LE(0, 6);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralDirectory.length, 12);
  end.writeUInt32LE(offset, 16);
  end.writeUInt16LE(0, 20);

  await writeFile(archivePath, Buffer.concat([...localParts, centralDirectory, end]));
}
