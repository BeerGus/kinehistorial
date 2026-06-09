import 'dart:convert';
import 'dart:io';

import 'package:archive/archive.dart';
import 'package:archive/archive_io.dart';
import 'package:open_filex/open_filex.dart';
import 'package:path/path.dart' as p;
import 'package:path_provider/path_provider.dart';

class StorageService {
  late Directory root;
  late Directory dataDir;
  late Directory mediaDir;

  String get _patientsFile => p.join(dataDir.path, 'patients.json');
  String get _entriesFile => p.join(dataDir.path, 'entries.json');
  String get _metaFile => p.join(dataDir.path, 'meta.json');
  String get _configFile => p.join(root.path, 'config.json');

  Future<void> init() async {
    final base = await getApplicationSupportDirectory();
    root = Directory(p.join(base.path, 'KineHistorial'));
    dataDir = Directory(p.join(root.path, 'data'));
    mediaDir = Directory(p.join(root.path, 'media'));

    if (!await root.exists()) await root.create(recursive: true);
    if (!await dataDir.exists()) await dataDir.create(recursive: true);
    if (!await mediaDir.exists()) await mediaDir.create(recursive: true);

    await _ensureFile(_patientsFile, defaultContent: '[]');
    await _ensureFile(_entriesFile, defaultContent: '[]');
    await _ensureFile(_metaFile, defaultContent: '{}');
    await _ensureFile(_configFile, defaultContent: '{}');
  }

  Future<void> _ensureFile(String path, {required String defaultContent}) async {
    final f = File(path);
    if (!await f.exists()) {
      await f.parent.create(recursive: true);
      await f.writeAsString(defaultContent, flush: true);
    }
  }

  String _nowIso() => DateTime.now().toUtc().toIso8601String();

  String _genId(String prefix) {
    final ms = DateTime.now().millisecondsSinceEpoch;
    final r = (ms % 10000).toString().padLeft(4, '0');
    return '$prefix$r';
  }

  Future<List<dynamic>> _readJsonList(String filePath) async {
    final f = File(filePath);
    final txt = await f.readAsString();
    final decoded = jsonDecode(txt);
    return decoded is List ? decoded : <dynamic>[];
  }

  Future<void> _writeJsonList(String filePath, List<dynamic> list) async {
    final f = File(filePath);
    await f.writeAsString(jsonEncode(list), flush: true);
  }

  Future<Map<String, dynamic>> _readMeta() async {
    try {
      final txt = await File(_metaFile).readAsString();
      final decoded = jsonDecode(txt);
      return decoded is Map ? Map<String, dynamic>.from(decoded) : <String, dynamic>{};
    } catch (_) {
      return <String, dynamic>{};
    }
  }

  Future<void> _writeMeta(Map<String, dynamic> meta) async {
    await File(_metaFile).writeAsString(jsonEncode(meta), flush: true);
  }

  Future<Map<String, dynamic>> getMeta() async {
    return await _readMeta();
  }

  Future<void> saveMeta(Map<String, dynamic> meta) async {
    await _writeMeta(meta);
  }

  // -------------------------
  // Config (profesional + dispositivo)
  // -------------------------
  Future<Map<String, dynamic>> getConfig() async {
    try {
      final txt = await File(_configFile).readAsString();
      final decoded = jsonDecode(txt);
      return decoded is Map ? Map<String, dynamic>.from(decoded) : <String, dynamic>{};
    } catch (_) {
      return <String, dynamic>{};
    }
  }

  Future<void> saveConfig(Map<String, dynamic> incoming) async {
    final current = await getConfig();
    if (incoming.containsKey('professional')) {
      current['professional'] = incoming['professional'];
    }
    final device = _deviceInfo();
    if (incoming.containsKey('deviceAlias')) {
      final alias = incoming['deviceAlias']?.toString().trim() ?? '';
      if (alias.isNotEmpty) device['alias'] = alias;
    } else if (current['device'] is Map) {
      final existingAlias = (current['device'] as Map)['alias']?.toString() ?? '';
      if (existingAlias.isNotEmpty) device['alias'] = existingAlias;
    }
    current['device'] = device;
    await File(_configFile).writeAsString(jsonEncode(current), flush: true);
  }

  Map<String, dynamic> _deviceInfo() {
    String os = Platform.operatingSystem.toUpperCase();
    String name = '';
    try {
      name = Platform.environment['COMPUTERNAME'] ??
             Platform.environment['HOSTNAME'] ??
             Platform.localHostname;
    } catch (_) {
      name = os;
    }
    return {'os': os, 'name': name};
  }

  // -------------------------
  // Patients
  // -------------------------
  Future<List<dynamic>> listPatients() async {
    return await _readJsonList(_patientsFile);
  }

  Future<void> upsertPatient(Map<String, dynamic> patient) async {
    final now = _nowIso();

    final list = await _readJsonList(_patientsFile);
    final id = (patient['id']?.toString().isNotEmpty ?? false)
        ? patient['id'].toString()
        : _genId('P');

    int idx = -1;
    for (int i = 0; i < list.length; i++) {
      final it = list[i];
      if (it is Map && it['id']?.toString() == id) {
        idx = i;
        break;
      }
    }

    if (idx == -1) {
      final obj = Map<String, dynamic>.from(patient);
      obj['id'] = id;
      obj['createdAt'] = obj['createdAt'] ?? now;
      obj['updatedAt'] = now;
      obj['version'] = obj['version'] ?? 0;
      list.add(obj);
    } else {
      final existing = Map<String, dynamic>.from(list[idx] as Map);
      final createdAt = existing['createdAt'] ?? now;
      final nextVersion = ((existing['version'] ?? 0) as num).toInt() + 1;

      final obj = Map<String, dynamic>.from(existing);
      final incoming = Map<String, dynamic>.from(patient);
      incoming.remove('id');
      obj.addAll(incoming);

      obj['id'] = id;
      obj['createdAt'] = createdAt;
      obj['updatedAt'] = now;
      obj['version'] = nextVersion;

      list[idx] = obj;
    }

    await _writeJsonList(_patientsFile, list);
  }

  // -------------------------
  // Entries
  // -------------------------
  Future<List<dynamic>> listEntries(String patientId) async {
    final list = await _readJsonList(_entriesFile);
    return list.where((e) => e is Map && e['patientId']?.toString() == patientId).toList();
  }

  Future<void> addEntryWithAttachments(
    Map<String, dynamic> entry,
    List<Map<String, dynamic>> filesBase64,
  ) async {
    final now = _nowIso();

    final patientId = entry['patientId']?.toString() ?? '';
    if (patientId.isEmpty) {
      throw Exception('patientId requerido');
    }

    final entryId = (entry['id']?.toString().isNotEmpty ?? false)
        ? entry['id'].toString()
        : _genId('E');

    final attachments = await _writeAttachments(
      patientId: patientId,
      entryId: entryId,
      filesBase64: filesBase64,
    );

    final obj = Map<String, dynamic>.from(entry);
    obj['id'] = entryId;
    obj['createdAt'] = obj['createdAt'] ?? now;
    obj['updatedAt'] = now;
    obj['version'] = (obj['version'] ?? 0);
    obj['status'] = obj['status'] ?? 'ACTIVE';
    obj['eventDate'] = obj['eventDate'] ?? obj['createdAt'];
    obj['versions'] = (obj['versions'] is List) ? obj['versions'] : [];
    obj['audit'] = (obj['audit'] is List)
        ? List<dynamic>.from(obj['audit'])
        : <dynamic>[];

    if ((obj['audit'] as List).isEmpty) {
      (obj['audit'] as List).add({
        'ts': obj['createdAt'],
        'action': 'CREADA',
      });
    }

    final existingAtt = (obj['attachments'] is List)
        ? List<Map<String, dynamic>>.from(obj['attachments'] as List)
        : <Map<String, dynamic>>[];
    obj['attachments'] = [...existingAtt, ...attachments];

    final list = await _readJsonList(_entriesFile);
    list.add(obj);
    await _writeJsonList(_entriesFile, list);
  }

  Future<void> updateEntryWithAttachments({
    required Map<String, dynamic> entry,
    required List<Map<String, dynamic>> filesBase64,
    required List<String> removeRelPaths,
  }) async {
    final now = _nowIso();
    final id = entry['id']?.toString() ?? '';
    if (id.isEmpty) throw Exception('entry.id requerido');

    final list = await _readJsonList(_entriesFile);

    int idx = -1;
    for (int i = 0; i < list.length; i++) {
      final it = list[i];
      if (it is Map && it['id']?.toString() == id) {
        idx = i;
        break;
      }
    }
    if (idx == -1) throw Exception('Entrada no encontrada: $id');

    final existing = Map<String, dynamic>.from(list[idx] as Map);
    final patientId = existing['patientId']?.toString() ?? '';
    final createdAt = existing['createdAt'] ?? now;
    final currentVersion = ((existing['version'] ?? 0) as num).toInt();
    final nextVersion = currentVersion + 1;

    final existingAtt = ((existing['attachments'] as List?) ?? [])
        .map((e) => Map<String, dynamic>.from(e as Map))
        .toList();

    final removeSet =
        removeRelPaths.map((e) => e.trim()).where((e) => e.isNotEmpty).toSet();

    final kept = <Map<String, dynamic>>[];
    for (final a in existingAtt) {
      final rel = (a['relPath'] ?? a['path'] ?? '').toString();
      if (removeSet.contains(rel)) {
        await _deleteByRelOrAbs(rel);
      } else {
        kept.add(a);
      }
    }

    final added = await _writeAttachments(
      patientId: patientId,
      entryId: id,
      filesBase64: filesBase64,
      uniquePrefix: DateTime.now().millisecondsSinceEpoch.toString(),
    );

    final obj = Map<String, dynamic>.from(existing);
    final incoming = Map<String, dynamic>.from(entry);
    incoming.remove('id');
    incoming.remove('createdAt');
    incoming.remove('updatedAt');
    incoming.remove('version');
    incoming.remove('attachments');

    obj.addAll(incoming);

    obj['id'] = id;
    obj['createdAt'] = createdAt;
    obj['updatedAt'] = now;
    obj['version'] = nextVersion;
    obj['attachments'] = [...kept, ...added];
    obj['versions'] = (obj['versions'] is List)
        ? List<dynamic>.from(obj['versions'])
        : <dynamic>[];
    obj['audit'] = (obj['audit'] is List)
        ? List<dynamic>.from(obj['audit'])
        : <dynamic>[];

    (obj['versions'] as List).add({
      'version': currentVersion,
      'ts': now,
    });

    final incomingAudit = (incoming['audit'] is List)
        ? List<dynamic>.from(incoming['audit'] as List)
        : null;

    if (incomingAudit != null && incomingAudit.isNotEmpty) {
      obj['audit'] = incomingAudit;
    } else {
      (obj['audit'] as List).add({
        'ts': now,
        'action': 'MODIFICADA',
      });
    }

    list[idx] = obj;
    await _writeJsonList(_entriesFile, list);
  }

  Future<void> updateEntry(Map<String, dynamic> entry) async {
    await updateEntryWithAttachments(
      entry: entry,
      filesBase64: const [],
      removeRelPaths: const [],
    );
  }

  Future<bool> openAttachment(String relPath) async {
    try {
      final abs = p.join(root.path, relPath);
      if (!await File(abs).exists()) return false;
      final res = await OpenFilex.open(abs);
      return res.type == ResultType.done;
    } catch (_) {
      return false;
    }
  }

  // -------------------------
  // Export / Import
  // -------------------------

  String _deviceName() {
    if (Platform.isAndroid) return 'ANDROID';
    if (Platform.isWindows) return 'WINDOWS';
    return Platform.operatingSystem.toUpperCase();
  }

  Future<Map<String, dynamic>> inspectSnapshotZip(
    String zipFilePath, {
    String? zipName,
  }) async {
    final bytes = await File(zipFilePath).readAsBytes();
    final archive = ZipDecoder().decodeBytes(bytes);

    ArchiveFile? manifestFile;
    for (final f in archive) {
      if (f.isFile && f.name.toLowerCase().endsWith('kinehistorial_manifest.json')) {
        manifestFile = f;
        break;
      }
    }

    Map<String, dynamic> manifest = {};
    if (manifestFile != null) {
      try {
        final txt = utf8.decode(manifestFile.content as List<int>);
        final decoded = jsonDecode(txt);
        if (decoded is Map) manifest = Map<String, dynamic>.from(decoded);
      } catch (_) {}
    }

    int patientsCount = (manifest['patientsCount'] as num?)?.toInt() ?? -1;
    int entriesCount = (manifest['entriesCount'] as num?)?.toInt() ?? -1;

    if (patientsCount < 0 || entriesCount < 0) {
      String? patientsTxt;
      String? entriesTxt;
      for (final f in archive) {
        if (!f.isFile) continue;
        final n = f.name.replaceAll('\\', '/');
        if (n.endsWith('data/patients.json')) {
          patientsTxt = utf8.decode(f.content as List<int>);
        } else if (n.endsWith('data/entries.json')) {
          entriesTxt = utf8.decode(f.content as List<int>);
        }
      }
      try {
        if (patientsCount < 0 && patientsTxt != null) {
          final decoded = jsonDecode(patientsTxt);
          patientsCount = decoded is List ? decoded.length : 0;
        }
      } catch (_) {
        if (patientsCount < 0) patientsCount = 0;
      }
      try {
        if (entriesCount < 0 && entriesTxt != null) {
          final decoded = jsonDecode(entriesTxt);
          entriesCount = decoded is List ? decoded.length : 0;
        }
      } catch (_) {
        if (entriesCount < 0) entriesCount = 0;
      }
    }

    final exportedAt = manifest['exportedAt']?.toString();
    final deviceName = manifest['deviceName']?.toString();
    final deviceType = manifest['deviceType']?.toString();

    return {
      'ok': true,
      'zipName': zipName,
      'exportedAt': exportedAt,
      'deviceName': deviceName,
      'deviceType': deviceType,
      'patientsCount': patientsCount,
      'entriesCount': entriesCount,
    };
  }

  Future<String> exportSnapshotZip() async {
    final now = _nowIso();

    final patients = await _readJsonList(_patientsFile);
    final entries = await _readJsonList(_entriesFile);
    final config = await getConfig();

    final device = _deviceInfo();
    if (config['device'] is Map) {
      final existingAlias = (config['device'] as Map)['alias']?.toString() ?? '';
      if (existingAlias.isNotEmpty) device['alias'] = existingAlias;
    }
    config['device'] = device;
    await File(_configFile).writeAsString(jsonEncode(config), flush: true);

    final deviceAlias = (config['device'] as Map?)?['alias']?.toString() ?? '';
    final manifestDeviceName = deviceAlias.isNotEmpty ? deviceAlias : _deviceName();

    final manifest = {
      'exportedAt': now,
      'deviceName': manifestDeviceName,
      'deviceType': _deviceName(),
      'patientsCount': patients.length,
      'entriesCount': entries.length,
    };

    final tempDir = await getTemporaryDirectory();
    final zipPath = p.join(tempDir.path, 'KineHistorial_snapshot.zip');

    final encoder = ZipFileEncoder();
    encoder.create(zipPath);

    encoder.addDirectory(root, includeDirName: true);

    final manifestTmp = File(p.join(tempDir.path, 'KineHistorial_manifest.json'));
    await manifestTmp.writeAsString(jsonEncode(manifest), flush: true);

    encoder.addFile(
      manifestTmp,
      p.join('KineHistorial', 'KineHistorial_manifest.json').replaceAll('\\', '/'),
    );

    encoder.close();

    final meta = await _readMeta();
    meta['lastExportAt'] = now;
    meta['lastExportSnapshot'] = manifest;
    await _writeMeta(meta);

    return zipPath;
  }

  // ── Verifica si hay datos locales (pacientes o entradas) ──────────────────
  Future<bool> _localHasData() async {
    try {
      final pf = File(_patientsFile);
      final ef = File(_entriesFile);
      if (!await pf.exists() && !await ef.exists()) return false;
      if (await pf.exists()) {
        final patients = await _readJsonList(_patientsFile);
        if (patients.isNotEmpty) return true;
      }
      if (await ef.exists()) {
        final entries = await _readJsonList(_entriesFile);
        if (entries.isNotEmpty) return true;
      }
      return false;
    } catch (_) {
      return false;
    }
  }

  // ── Backup del estado local antes de un merge ──────────────────────────────
  // Genera un ZIP del estado actual en el directorio temporal.
  // El path queda guardado en meta['lastImportedSnapshot']['backupPath'].
  Future<String> _backupLocalState() async {
    final stamp = DateTime.now()
        .toUtc()
        .toIso8601String()
        .replaceAll(':', '-')
        .replaceAll('.', '-');
    final tempDir = await getTemporaryDirectory();
    final backupPath = p.join(tempDir.path, 'KineHistorial_backup_$stamp.zip');

    if (!await root.exists()) return backupPath;

    final encoder = ZipFileEncoder();
    encoder.create(backupPath);
    encoder.addDirectory(root, includeDirName: true);
    encoder.close();

    return backupPath;
  }

  // ── Helper de comparacion de fechas ISO ───────────────────────────────────
  // Retorna true si a es más reciente o igual que b.
  // null se trata como el más antiguo posible.
  bool _isNewerOrEqual(String? a, String? b) {
    if (a == null) return false;
    if (b == null) return true;
    return a.compareTo(b) >= 0;
  }

  // ── Copia adjuntos desde el ZIP al filesystem local ───────────────────────
  // Solo copia los que no existen ya localmente.
  Future<void> _mergeAttachmentsFromZip(
    Archive archive,
    Map<String, dynamic> entry,
  ) async {
    final attachments = entry['attachments'];
    if (attachments is! List) return;

    for (final att in attachments) {
      if (att is! Map) continue;
      final relPath = (att['relPath'] ?? att['path'] ?? '').toString();
      if (relPath.isEmpty) continue;

      final absPath = p.join(
        root.path,
        relPath.replaceAll('/', Platform.pathSeparator),
      );
      if (await File(absPath).exists()) continue;

      // El ZIP usa 'KineHistorial/' como prefijo de directorio raíz
      final zipEntryName = 'KineHistorial/${relPath.replaceAll('\\', '/')}';
      ArchiveFile? zipFile;
      for (final zf in archive) {
        if (zf.isFile && zf.name.replaceAll('\\', '/') == zipEntryName) {
          zipFile = zf;
          break;
        }
      }
      if (zipFile == null) continue;

      final outFile = File(absPath);
      await outFile.parent.create(recursive: true);
      await outFile.writeAsBytes(zipFile.content as List<int>, flush: true);
    }
  }

  // ── Normalización de texto para comparación de duplicados ───────────────────
  String _normalize(String? s) {
    if (s == null) return '';
    // Quitar tildes y pasar a lowercase
    final withoutDiacritics = s
        .toLowerCase()
        .replaceAll(RegExp(r'[áàäâ]'), 'a')
        .replaceAll(RegExp(r'[éèëê]'), 'e')
        .replaceAll(RegExp(r'[íìïî]'), 'i')
        .replaceAll(RegExp(r'[óòöô]'), 'o')
        .replaceAll(RegExp(r'[úùüû]'), 'u')
        .replaceAll(RegExp(r'[ñ]'), 'n');
    return withoutDiacritics.trim();
  }

  // ── Detección de duplicados entre local y ZIP ─────────────────────────────
  // Retorna lista de pares {local, zip} que coinciden por algún criterio (OR):
  //   - nombre + apellido normalizados iguales
  //   - DNI igual (solo si ambos tienen valor)
  //   - email igual (solo si ambos tienen valor)
  List<Map<String, dynamic>> _detectDuplicates(
    List<Map<String, dynamic>> localPatients,
    List<Map<String, dynamic>> zipPatients,
  ) {
    final duplicates = <Map<String, dynamic>>[];
    final processedPairs = <String>{};

    for (final local in localPatients) {
      final localId = local['id']?.toString() ?? '';
      for (final zip in zipPatients) {
        final zipId = zip['id']?.toString() ?? '';

        // Ignorar si tienen el mismo ID (ya lo resuelve el merge por ID)
        if (localId == zipId) continue;

        final pairKey = '$localId|$zipId';
        if (processedPairs.contains(pairKey)) continue;

        bool isDuplicate = false;

        // Criterio 1: nombre + apellido normalizados
        final localNombre = _normalize(local['nombre']?.toString());
        final localApellido = _normalize(local['apellido']?.toString());
        final zipNombre = _normalize(zip['nombre']?.toString());
        final zipApellido = _normalize(zip['apellido']?.toString());
        if (localNombre.isNotEmpty && localApellido.isNotEmpty &&
            localNombre == zipNombre && localApellido == zipApellido) {
          isDuplicate = true;
        }

        // Criterio 2: DNI igual (ambos con valor)
        if (!isDuplicate) {
          final localDni = (local['dni']?.toString() ?? '').trim();
          final zipDni = (zip['dni']?.toString() ?? '').trim();
          if (localDni.isNotEmpty && zipDni.isNotEmpty && localDni == zipDni) {
            isDuplicate = true;
          }
        }

        // Criterio 3: email igual (ambos con valor)
        if (!isDuplicate) {
          final localEmail = _normalize(local['email']?.toString());
          final zipEmail = _normalize(zip['email']?.toString());
          if (localEmail.isNotEmpty && zipEmail.isNotEmpty && localEmail == zipEmail) {
            isDuplicate = true;
          }
        }

        if (isDuplicate) {
          processedPairs.add(pairKey);
          duplicates.add({'local': local, 'zip': zip});
        }
      }
    }

    return duplicates;
  }

  // ── Merge principal: combina local + ZIP por updatedAt ────────────────────
  Future<void> _mergeWithZip(String zipFilePath, Archive archive) async {
    // Leer estado local
    final localPatients = List<Map<String, dynamic>>.from(
      (await _readJsonList(_patientsFile))
          .whereType<Map>()
          .map((e) => Map<String, dynamic>.from(e)),
    );
    final localEntries = List<Map<String, dynamic>>.from(
      (await _readJsonList(_entriesFile))
          .whereType<Map>()
          .map((e) => Map<String, dynamic>.from(e)),
    );

    // Leer estado del ZIP
    List<dynamic> zipPatients = [];
    List<dynamic> zipEntries = [];
    for (final zf in archive) {
      if (!zf.isFile) continue;
      final name = zf.name.replaceAll('\\', '/');
      if (name.endsWith('data/patients.json')) {
        try {
          final decoded = jsonDecode(utf8.decode(zf.content as List<int>));
          if (decoded is List) zipPatients = decoded;
        } catch (_) {}
      } else if (name.endsWith('data/entries.json')) {
        try {
          final decoded = jsonDecode(utf8.decode(zf.content as List<int>));
          if (decoded is List) zipEntries = decoded;
        } catch (_) {}
      }
    }

    // ── Merge pacientes ──────────────────────────────────────────────────────
    final patientsById = <String, Map<String, dynamic>>{
      for (final pt in localPatients)
        if ((pt['id']?.toString().isNotEmpty ?? false)) pt['id'].toString(): {
          ...Map<String, dynamic>.from(pt),
          '_mergeTag': 'unchanged',
        },
    };

    for (final zp in zipPatients) {
      if (zp is! Map) continue;
      final zipPatient = Map<String, dynamic>.from(zp);
      final id = zipPatient['id']?.toString() ?? '';
      if (id.isEmpty) continue;

      final local = patientsById[id];
      if (local == null) {
        // Nuevo en ZIP → agregar con tag 'new'
        patientsById[id] = {...zipPatient, '_mergeTag': 'new'};
      } else {
        // Existe en ambos → gana el más reciente
        if (_isNewerOrEqual(
          zipPatient['updatedAt']?.toString(),
          local['updatedAt']?.toString(),
        )) {
          patientsById[id] = {...zipPatient, '_mergeTag': 'unchanged'};
        }
        // Si gana el local, mantiene su tag actual
      }
    }

    // ── Detectar posibles duplicados (mismo paciente con distinto ID) ─────────
    final localList = patientsById.values.toList();
    final zipList = zipPatients.whereType<Map>()
        .map((e) => Map<String, dynamic>.from(e)).toList();
    final duplicates = _detectDuplicates(localList, zipList);
    // Los duplicados se retornan al caller para resolución en el JS via handler
    // Se guardan en meta para que el JS los lea al completar el import
    if (duplicates.isNotEmpty) {
      final meta = await _readMeta();
      meta['pendingDuplicates'] = duplicates.map((d) => {
        'localId': d['local']['id'],
        'zipId': d['zip']['id'],
        'local': d['local'],
        'zip': d['zip'],
      }).toList();
      await _writeMeta(meta);
    }

    // ── Merge entradas ───────────────────────────────────────────────────────
    final entriesById = <String, Map<String, dynamic>>{
      for (final en in localEntries)
        if ((en['id']?.toString().isNotEmpty ?? false)) en['id'].toString(): en,
    };

    for (final ze in zipEntries) {
      if (ze is! Map) continue;
      final zipEntry = Map<String, dynamic>.from(ze);
      final id = zipEntry['id']?.toString() ?? '';
      if (id.isEmpty) continue;

      final local = entriesById[id];
      if (local == null) {
        // Nueva en ZIP → agregar y copiar adjuntos
        entriesById[id] = zipEntry;
        await _mergeAttachmentsFromZip(archive, zipEntry);
      } else {
        // Existe en ambos → gana el más reciente (incluye ELIMINATED)
        if (_isNewerOrEqual(
          zipEntry['updatedAt']?.toString(),
          local['updatedAt']?.toString(),
        )) {
          entriesById[id] = zipEntry;
          await _mergeAttachmentsFromZip(archive, zipEntry);
        }
      }
    }

    // Persistir resultado
    await _writeJsonList(_patientsFile, patientsById.values.toList());
    await _writeJsonList(_entriesFile, entriesById.values.toList());
  }

  Future<void> importSnapshotZip(
    String zipFilePath, {
    String? zipName,
    Map<String, dynamic>? inspected,
    bool forceReplace = false,
  }) async {
    final now = _nowIso();

    final summary =
        inspected ?? await inspectSnapshotZip(zipFilePath, zipName: zipName);

    // ── Preservar config local ───────────────────────────────────────────────
    Map<String, dynamic>? localConfig;
    final configFile = File(_configFile);
    if (await configFile.exists()) {
      try {
        final txt = await configFile.readAsString();
        final decoded = jsonDecode(txt);
        if (decoded is Map) localConfig = Map<String, dynamic>.from(decoded);
      } catch (_) {}
    }

    // ── Detectar modo: merge si hay datos locales, reemplazo si no ───────────
    final localHasData = await _localHasData();

    // ── Backup previo al merge ───────────────────────────────────────────────
    String? backupPath;
    if (localHasData) {
      backupPath = await _backupLocalState();
    }

    // ── Leer ZIP en memoria ──────────────────────────────────────────────────
    final bytes = await File(zipFilePath).readAsBytes();
    final archive = ZipDecoder().decodeBytes(bytes);

    if (localHasData && !forceReplace) {
      // MERGE
      await _mergeWithZip(zipFilePath, archive);
    } else {
      // REEMPLAZO (comportamiento original)
      if (await root.exists()) {
        await root.delete(recursive: true);
      }

      final base = await getApplicationSupportDirectory();
      await Directory(base.path).create(recursive: true);

      for (final file in archive) {
        final filename = file.name.replaceAll('\\', '/');
        final outPath = p.join(base.path, filename);
        if (file.isFile) {
          final outFile = File(outPath);
          await outFile.parent.create(recursive: true);
          await outFile.writeAsBytes(file.content as List<int>, flush: true);
        } else {
          await Directory(outPath).create(recursive: true);
        }
      }

      await init();
    }

    // ── Restaurar config local siempre ───────────────────────────────────────
    if (localConfig != null) {
      final importedConfig = await getConfig();

      final localProfessional = localConfig['professional'];
      final importedProfessional = importedConfig['professional'];
      final professionalToKeep =
          (localProfessional is Map && localProfessional.isNotEmpty)
              ? localProfessional
              : importedProfessional;

      final restoredConfig = {
        ...importedConfig,
        'professional': professionalToKeep,
        'device': localConfig['device'],
      };

      await File(_configFile)
          .writeAsString(jsonEncode(restoredConfig), flush: true);
    }

    // ── Actualizar meta ──────────────────────────────────────────────────────
    final meta = await _readMeta();
    meta['lastImportAt'] = now;
    meta['lastImportedSnapshot'] = {
      'exportedAt': summary['exportedAt'],
      'deviceName': summary['deviceName'],
      'deviceType': summary['deviceType'],
      'patientsCount': summary['patientsCount'],
      'entriesCount': summary['entriesCount'],
      'zipName': summary['zipName'] ?? zipName,
      'mergeMode': (localHasData && !forceReplace) ? 'merge' : 'replace',
      if (backupPath != null) 'backupPath': backupPath,
    };
    await _writeMeta(meta);
  }

  // ── Restaurar backup previo al merge ─────────────────────────────────────
  // Recibe el path del ZIP de backup generado antes del merge y lo restaura
  // como si fuera una importación limpia, preservando config local.
  Future<Map<String, dynamic>> restoreBackup(String backupPath) async {
    try {
      final backupFile = File(backupPath);
      if (!await backupFile.exists()) {
        return {'ok': false, 'error': 'Archivo de backup no encontrado'};
      }

      // Preservar config local
      Map<String, dynamic>? localConfig;
      final configFile = File(_configFile);
      if (await configFile.exists()) {
        try {
          final txt = await configFile.readAsString();
          final decoded = jsonDecode(txt);
          if (decoded is Map) localConfig = Map<String, dynamic>.from(decoded);
        } catch (_) {}
      }

      // Reemplazar todo con el contenido del backup
      if (await root.exists()) {
        await root.delete(recursive: true);
      }

      final base = await getApplicationSupportDirectory();
      await Directory(base.path).create(recursive: true);

      final bytes = await backupFile.readAsBytes();
      final archive = ZipDecoder().decodeBytes(bytes);

      for (final file in archive) {
        final filename = file.name.replaceAll('\\', '/');
        final outPath = p.join(base.path, filename);
        if (file.isFile) {
          final outFile = File(outPath);
          await outFile.parent.create(recursive: true);
          await outFile.writeAsBytes(file.content as List<int>, flush: true);
        } else {
          await Directory(outPath).create(recursive: true);
        }
      }

      await init();

      // Restaurar config local (device siempre, professional si existía)
      if (localConfig != null) {
        final restoredConfig = await getConfig();
        final localProfessional = localConfig['professional'];
        final importedProfessional = restoredConfig['professional'];
        final professionalToKeep =
            (localProfessional is Map && localProfessional.isNotEmpty)
                ? localProfessional
                : importedProfessional;

        final finalConfig = {
          ...restoredConfig,
          'professional': professionalToKeep,
          'device': localConfig['device'],
        };
        await File(_configFile)
            .writeAsString(jsonEncode(finalConfig), flush: true);
      }

      // Limpiar referencia al backup en meta para que el botón desaparezca
      final meta = await _readMeta();
      if (meta['lastImportedSnapshot'] is Map) {
        (meta['lastImportedSnapshot'] as Map).remove('backupPath');
        (meta['lastImportedSnapshot'] as Map)['mergeMode'] = 'restored';
      }
      await _writeMeta(meta);

      return {'ok': true};
    } catch (e) {
      return {'ok': false, 'error': e.toString()};
    }
  }
  // ──────────────────────────────────────────────────────────────────────────

  // ── Fusión manual de dos pacientes ──────────────────────────────────────────
  // baseId: paciente que conserva el ID (el más reciente por updatedAt)
  // otherId: paciente que se elimina tras fusionar
  // mergedFields: mapa con los valores elegidos campo por campo
  Future<Map<String, dynamic>> mergePatients({
    required String baseId,
    required String otherId,
    required Map<String, dynamic> mergedFields,
  }) async {
    try {
      final patients = await _readJsonList(_patientsFile);

      Map<String, dynamic>? basePatient;
      Map<String, dynamic>? otherPatient;
      for (final pt in patients) {
        if (pt is! Map) continue;
        if (pt['id']?.toString() == baseId) basePatient = Map<String, dynamic>.from(pt);
        if (pt['id']?.toString() == otherId) otherPatient = Map<String, dynamic>.from(pt);
      }

      if (basePatient == null || otherPatient == null) {
        return {'ok': false, 'error': 'Paciente no encontrado'};
      }

      // Aplicar campos elegidos por el usuario
      final now = _nowIso();
      final merged = {
        ...basePatient,
        ...mergedFields,
        'id': baseId,
        'updatedAt': now,
        '_mergeTag': 'merged',
      };

      // Reasignar todas las entradas del paciente eliminado al base
      final entries = await _readJsonList(_entriesFile);
      final updatedEntries = entries.map((e) {
        if (e is! Map) return e;
        final entry = Map<String, dynamic>.from(e);
        if (entry['patientId']?.toString() == otherId) {
          entry['patientId'] = baseId;
        }
        return entry;
      }).toList();

      // Mover archivos de media del otro al base (renombrar carpeta si existe)
      final otherMediaDir = Directory(p.join(mediaDir.path, 'patients', otherId));
      final baseMediaDir = Directory(p.join(mediaDir.path, 'patients', baseId));
      if (await otherMediaDir.exists()) {
        if (!await baseMediaDir.exists()) await baseMediaDir.create(recursive: true);
        // Mover archivos uno por uno
        await for (final entity in otherMediaDir.list(recursive: true)) {
          if (entity is File) {
            final rel = p.relative(entity.path, from: otherMediaDir.path);
            final dest = File(p.join(baseMediaDir.path, rel));
            await dest.parent.create(recursive: true);
            await entity.copy(dest.path);
            await entity.delete();
          }
        }
        // Actualizar relPath en entradas reasignadas
        for (int i = 0; i < updatedEntries.length; i++) {
          final e = updatedEntries[i];
          if (e is! Map) continue;
          final entry = Map<String, dynamic>.from(e);
          if (entry['patientId']?.toString() != baseId) continue;
          if (entry['attachments'] is List) {
            final atts = (entry['attachments'] as List).map((a) {
              if (a is! Map) return a;
              final att = Map<String, dynamic>.from(a);
              final rel = (att['relPath'] ?? att['path'] ?? '').toString();
              if (rel.contains('patients/$otherId/')) {
                att['relPath'] = rel.replaceAll('patients/$otherId/', 'patients/$baseId/');
              }
              return att;
            }).toList();
            entry['attachments'] = atts;
            updatedEntries[i] = entry;
          }
        }
        try { await otherMediaDir.delete(recursive: true); } catch (_) {}
      }

      // Guardar paciente fusionado, eliminar el otro
      final updatedPatients = patients
          .where((pt) => pt is Map && pt['id']?.toString() != otherId)
          .map((pt) {
            if (pt is Map && pt['id']?.toString() == baseId) return merged;
            return pt;
          }).toList();

      await _writeJsonList(_patientsFile, updatedPatients);
      await _writeJsonList(_entriesFile, updatedEntries);

      return {'ok': true};
    } catch (e) {
      return {'ok': false, 'error': e.toString()};
    }
  }
  // ──────────────────────────────────────────────────────────────────────────

  // ── Borrado permanente de paciente ────────────────────────────────────────
  // Elimina el paciente, todas sus entradas y todos sus adjuntos del disco.
  Future<Map<String, dynamic>> deletePatient(String patientId) async {
    try {
      if (patientId.isEmpty) return {'ok': false, 'error': 'patientId requerido'};

      // Borrar adjuntos en disco de cada entrada del paciente
      final entries = await _readJsonList(_entriesFile);
      for (final e in entries) {
        if (e is! Map) continue;
        if (e['patientId']?.toString() != patientId) continue;
        final attachments = e['attachments'];
        if (attachments is List) {
          for (final att in attachments) {
            if (att is! Map) continue;
            final rel = (att['relPath'] ?? att['path'] ?? '').toString();
            if (rel.isNotEmpty) await _deleteByRelOrAbs(rel);
          }
        }
      }

      // Borrar carpeta de media del paciente si existe
      final patientMediaDir = Directory(
        p.join(mediaDir.path, 'patients', patientId),
      );
      if (await patientMediaDir.exists()) {
        await patientMediaDir.delete(recursive: true);
      }

      // Borrar entradas del paciente de entries.json
      final remainingEntries = entries
          .where((e) => e is Map && e['patientId']?.toString() != patientId)
          .toList();
      await _writeJsonList(_entriesFile, remainingEntries);

      // Borrar paciente de patients.json
      final patients = await _readJsonList(_patientsFile);
      final remainingPatients = patients
          .where((pt) => pt is Map && pt['id']?.toString() != patientId)
          .toList();
      await _writeJsonList(_patientsFile, remainingPatients);

      return {'ok': true};
    } catch (e) {
      return {'ok': false, 'error': e.toString()};
    }
  }
  // ──────────────────────────────────────────────────────────────────────────

  // -------------------------
  // Helpers adjuntos
  // -------------------------

  Future<List<Map<String, dynamic>>> _writeAttachments({
    required String patientId,
    required String entryId,
    required List<Map<String, dynamic>> filesBase64,
    String? uniquePrefix,
  }) async {
    final patientDir = Directory(p.join(mediaDir.path, 'patients', patientId));
    final imagesDir = Directory(p.join(patientDir.path, 'images'));
    final filesDir = Directory(p.join(patientDir.path, 'files'));

    if (!await imagesDir.exists()) await imagesDir.create(recursive: true);
    if (!await filesDir.exists()) await filesDir.create(recursive: true);

    final attachments = <Map<String, dynamic>>[];

    for (final f in filesBase64) {
      final name = (f['name'] ?? 'file').toString();
      final mime = (f['mime'] ?? f['type'] ?? 'application/octet-stream').toString();

      final b64 = (f['base64'] ?? '').toString();
      final srcPath = (f['path'] ?? '').toString();

      List<int>? bytes;
      if (b64.trim().isNotEmpty) {
        bytes = base64Decode(b64);
      } else if (srcPath.trim().isNotEmpty && await File(srcPath).exists()) {
        bytes = await File(srcPath).readAsBytes();
      }

      if (bytes == null || bytes.isEmpty) continue;

      final isImage = mime.startsWith('image/');
      final targetDir = isImage ? imagesDir : filesDir;

      final prefix = (uniquePrefix == null || uniquePrefix.isEmpty)
          ? entryId
          : '${entryId}_$uniquePrefix';

      final safeName =
          '${prefix}_$name'.replaceAll(RegExp(r'[\\/:*?"<>|]'), '_');
      final out = File(p.join(targetDir.path, safeName));
      await out.writeAsBytes(bytes, flush: true);

      final relPath = isImage
          ? 'media/patients/$patientId/images/$safeName'
          : 'media/patients/$patientId/files/$safeName';

      attachments.add({
        'name': name,
        'mime': mime,
        'type': mime,
        'relPath': relPath,
      });
    }

    return attachments;
  }

  String _resolveToAbs(String relOrAbs) {
    final s = relOrAbs.trim();
    final isAbsWindows =
        RegExp(r'^[a-zA-Z]:\\').hasMatch(s) || s.startsWith(r'\\');
    final isAbsUnix = s.startsWith('/');
    if (isAbsWindows || isAbsUnix) return s;

    final norm = s
        .replaceAll("\\", Platform.pathSeparator)
        .replaceAll("/", Platform.pathSeparator);
    return p.normalize(p.join(root.path, norm));
  }

  Future<void> _deleteByRelOrAbs(String relOrAbs) async {
    try {
      final abs = _resolveToAbs(relOrAbs);
      final f = File(abs);
      if (await f.exists()) await f.delete();
    } catch (_) {}
  }
}
