const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');

function loadEnv(filePath) {
    if (!fs.existsSync(filePath)) return;
    const raw = fs.readFileSync(filePath, 'utf8');
    const lines = raw.split(/\r?\n/);
    for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;
        const eqIndex = trimmed.indexOf('=');
        if (eqIndex === -1) continue;
        const key = trimmed.slice(0, eqIndex).trim();
        let value = trimmed.slice(eqIndex + 1).trim();
        if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
            value = value.slice(1, -1);
        }
        if (!process.env[key]) process.env[key] = value;
    }
}

async function main() {
    const days = Number(process.argv[2] || 2);
    if (!Number.isFinite(days) || days <= 0) {
        throw new Error('Days must be a positive number.');
    }

    loadEnv(path.join(__dirname, '.env'));

    const mongoUri = process.env.MONGODB_URI;
    if (!mongoUri) {
        throw new Error('MONGODB_URI is missing in environment.');
    }

    await mongoose.connect(mongoUri);

    const AuditLogSchema = new mongoose.Schema(
        {
            emailedAt: Date,
            auditDay: mongoose.Schema.Types.ObjectId,
        },
        { collection: 'auditlogs' },
    );

    const AuditDaySchema = new mongoose.Schema(
        {
            logs: [mongoose.Schema.Types.ObjectId],
            emailedAt: Date,
        },
        { collection: 'auditdays' },
    );

    const AuditLog = mongoose.model('AuditLog', AuditLogSchema);
    const AuditDay = mongoose.model('AuditDay', AuditDaySchema);

    const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const logs = await AuditLog.find(
        { emailedAt: { $exists: true, $lte: cutoff } },
        { _id: 1, auditDay: 1 },
    ).lean();

    if (logs.length === 0) {
        console.log('No emailed audit logs older than cutoff.');
        await mongoose.disconnect();
        return;
    }

    const logIds = logs.map((log) => log._id);
    const auditDayIds = Array.from(
        new Set(logs.map((log) => String(log.auditDay)).filter(Boolean)),
    ).map((id) => new mongoose.Types.ObjectId(id));

    const deleteResult = await AuditLog.deleteMany({ _id: { $in: logIds } });

    if (auditDayIds.length > 0) {
        await AuditDay.updateMany(
            { _id: { $in: auditDayIds } },
            { $pull: { logs: { $in: logIds } } },
        );

        const emptyDays = await AuditDay.find(
            {
                _id: { $in: auditDayIds },
                emailedAt: { $exists: true, $lte: cutoff },
                logs: { $size: 0 },
            },
            { _id: 1 },
        ).lean();

        if (emptyDays.length > 0) {
            await AuditDay.deleteMany({ _id: { $in: emptyDays.map((d) => d._id) } });
        }

        console.log(
            `Deleted ${deleteResult.deletedCount || 0} audit logs. Cleaned ${emptyDays.length} empty audit days.`,
        );
    } else {
        console.log(`Deleted ${deleteResult.deletedCount || 0} audit logs.`);
    }

    await mongoose.disconnect();
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
