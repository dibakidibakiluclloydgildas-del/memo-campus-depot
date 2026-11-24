import { createHash, randomBytes } from 'node:crypto';
import { Injectable, Logger } from '@nestjs/common';
import * as argon2 from 'argon2';

/**
 * Primitives de sécurité centralisées.
 *  - Mots de passe : Argon2id (recommandation OWASP 2024), paramètres explicites.
 *  - Jetons opaques (sessions, réinitialisation) : 32 octets aléatoires,
 *    stockés **hachés** en base (une fuite de base ne donne pas de session).
 */
@Injectable()
export class SecurityService {
  private readonly logger = new Logger(SecurityService.name);

  private static readonly ARGON_OPTIONS: argon2.Options = {
    type: argon2.argon2id,
    memoryCost: 19_456, // 19 MiB
    timeCost: 2,
    parallelism: 1,
  };

  async hashPassword(password: string): Promise<string> {
    return argon2.hash(password, SecurityService.ARGON_OPTIONS);
  }

  async verifyPassword(hash: string, password: string): Promise<boolean> {
    try {
      return await argon2.verify(hash, password);
    } catch (error) {
      this.logger.warn(`Échec de vérification de hachage : ${(error as Error).message}`);
      return false;
    }
  }

  /** Jeton opaque remis au client ; seul son SHA-256 est persisté. */
  generateOpaqueToken(): { token: string; hash: string } {
    const token = randomBytes(32).toString('base64url');
    return { token, hash: this.hashToken(token) };
  }

  hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  /**
   * Limitation progressive des tentatives de connexion : verrouillage temporaire
   * après 5 échecs consécutifs (durée croissante).
   */
  computeLock(failedLogins: number): { lockedUntil: Date | null; shouldLock: boolean } {
    if (failedLogins + 1 < 5) return { lockedUntil: null, shouldLock: false };
    const extraAttempts = failedLogins + 1 - 5;
    const minutes = Math.min(60, 5 * 2 ** Math.min(extraAttempts, 4));
    return { lockedUntil: new Date(Date.now() + minutes * 60_000), shouldLock: true };
  }
}
