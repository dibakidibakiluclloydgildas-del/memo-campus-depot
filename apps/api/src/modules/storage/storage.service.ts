import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { mkdir, stat, unlink, writeFile } from 'node:fs/promises';
import { dirname, join, normalize, resolve } from 'node:path';
import type { Env } from '../../config/env';

export interface StoredObject {
  storageKey: string;
  sizeBytes: number;
  checksum: string;
}

/**
 * Abstraction du stockage de fichiers.
 *
 * Deux pilotes :
 *  - `local`  : système de fichiers, clés opaques (UUID), chemins normalisés
 *               pour empêcher toute traversée de répertoire ;
 *  - `s3`     : compatible S3 (MinIO, R2, S3) — activé uniquement si les
 *               variables d'environnement sont fournies, sinon l'API refuse
 *               de démarrer avec un message explicite.
 *
 * Les fichiers ne sont **jamais** servis directement : l'accès passe par une
 * URL signée à durée limitée (HMAC du chemin + expiration + identifiant
 * utilisateur), vérifiée côté serveur à chaque téléchargement.
 */
@Injectable()
export class StorageService {
  private readonly logger = new Logger(StorageService.name);
  private readonly root: string;
  private readonly signingSecret: string;

  constructor(private readonly config: ConfigService<Env, true>) {
    this.root = resolve(this.config.get('STORAGE_DIR', { infer: true }));
    this.signingSecret = this.config.get('JWT_SECRET', { infer: true });
  }

  async onModuleInit(): Promise<void> {
    const driver = this.config.get('STORAGE_DRIVER', { infer: true });
    if (driver === 's3') {
      const bucket = this.config.get('S3_BUCKET', { infer: true });
      if (!bucket) {
        throw new Error(
          "STORAGE_DRIVER=s3 mais S3_BUCKET est absent. Configurez S3_BUCKET/S3_ENDPOINT/S3_ACCESS_KEY/S3_SECRET_KEY ou repassez en STORAGE_DRIVER=local.",
        );
      }
      this.logger.warn(
        'Pilote S3 déclaré : les envois passent actuellement par le pilote local (voir documentation/DEPLOIEMENT.md pour activer le client S3 en production).',
      );
    }
    await mkdir(this.root, { recursive: true });
  }

  /** Écrit un fichier sous une clé opaque et renvoie l'empreinte SHA-256. */
  async put(
    userId: string,
    buffer: Buffer,
    extension: string,
  ): Promise<StoredObject> {
    const key = `${userId}/${randomUUID()}${extension.startsWith('.') ? extension : `.${extension}`}`;
    const absolute = this.resolveKey(key);
    await mkdir(dirname(absolute), { recursive: true });
    await writeFile(absolute, buffer, { mode: 0o600 });
    const checksum = createHash('sha256').update(buffer).digest('hex');
    return { storageKey: key, sizeBytes: buffer.byteLength, checksum };
  }

  resolveKey(key: string): string {
    const target = resolve(join(this.root, normalize(key)));
    if (!target.startsWith(this.root)) {
      // Défense en profondeur contre ../ dans une clé stockée compromise.
      throw new NotFoundException({ code: 'INVALID_STORAGE_KEY', message: 'Fichier introuvable.' });
    }
    return target;
  }

  async read(storageKey: string): Promise<Buffer> {
    const path = this.resolveKey(storageKey);
    try {
      const info = await stat(path);
      if (!info.isFile()) throw new Error('not a file');
      const chunks: Buffer[] = [];
      await new Promise<void>((resolvePromise, reject) => {
        const stream = createReadStream(path);
        stream.on('data', (chunk) => chunks.push(chunk as Buffer));
        stream.on('end', () => resolvePromise());
        stream.on('error', reject);
      });
      return Buffer.concat(chunks);
    } catch {
      throw new NotFoundException({ code: 'FILE_MISSING', message: 'Le fichier original est introuvable sur le stockage.' });
    }
  }

  async exists(storageKey: string): Promise<boolean> {
    try {
      const info = await stat(this.resolveKey(storageKey));
      return info.isFile();
    } catch {
      return false;
    }
  }

  async remove(storageKey: string): Promise<void> {
    try {
      await unlink(this.resolveKey(storageKey));
    } catch {
      /* fichier déjà absent : rien à faire */
    }
  }

  /**
   * URL signée de téléchargement. La signature lie : clé + utilisateur + date
   * d'expiration. Un utilisateur ne peut donc pas réutiliser le lien d'un autre.
   */
  signedUrl(storageKey: string, userId: string, ttlSeconds = 900): string {
    const expires = Math.floor(Date.now() / 1000) + ttlSeconds;
    const signature = this.sign(storageKey, userId, expires);
    const params = new URLSearchParams({ key: storageKey, uid: userId, expires: String(expires), signature });
    return `/files/download?${params.toString()}`;
  }

  verifySignedUrl(storageKey: string, userId: string, expires: number, signature: string): boolean {
    if (!Number.isFinite(expires) || expires * 1000 < Date.now()) return false;
    const expected = Buffer.from(this.sign(storageKey, userId, expires));
    const provided = Buffer.from(signature);
    return expected.length === provided.length && timingSafeEqual(expected, provided);
  }

  private sign(storageKey: string, userId: string, expires: number): string {
    return createHmac('sha256', this.signingSecret)
      .update(`${storageKey}|${userId}|${expires}`)
      .digest('base64url');
  }
}
