import 'dart:convert';
import 'dart:io';

import 'package:archive/archive.dart';
import 'package:file_picker/file_picker.dart';
import 'package:flutter/material.dart';
import 'package:flutter_file_dialog/flutter_file_dialog.dart';
import 'package:flutter_inappwebview/flutter_inappwebview.dart';
import 'package:open_filex/open_filex.dart';
import 'package:path/path.dart' as p;
import 'package:path_provider/path_provider.dart';

import 'storage_service.dart';

void main() async {
  WidgetsFlutterBinding.ensureInitialized();

  if (Platform.isAndroid) {
    await InAppWebViewController.setWebContentsDebuggingEnabled(true);
  }

  runApp(const App());
}

class App extends StatefulWidget {
  const App({super.key});

  @override
  State<App> createState() => _AppState();
}

class _AppState extends State<App> {
  final storage = StorageService();
  final _navKey = GlobalKey<NavigatorState>();

  late final InAppLocalhostServer localhostServer;
  InAppWebViewController? controller;
  bool ready = false;

  @override
  void initState() {
    super.initState();
    localhostServer = InAppLocalhostServer(documentRoot: 'assets');
    _boot();
  }

  Future<void> _boot() async {
    await storage.init();
    await localhostServer.start();
    setState(() => ready = true);
  }

  String _isoShort(String? iso) {
    if (iso == null || iso.isEmpty) return "-";
    if (iso.length >= 16) {
      return "${iso.substring(0, 10)} ${iso.substring(11, 16)}";
    }
    return iso;
  }

  Future<Map<String, dynamic>> _inspectZipSummary(
    String zipPath, {
    String? zipName,
  }) async {
    final bytes = await File(zipPath).readAsBytes();
    final archive = ZipDecoder().decodeBytes(bytes);

    String? patientsTxt;
    String? entriesTxt;
    String? exportedAt;
    String? deviceName;

    for (final f in archive) {
      if (!f.isFile) continue;
      final n = f.name.replaceAll('\\', '/').toLowerCase();
      if (n.endsWith('kinehistorial_manifest.json')) {
        try {
          final txt = utf8.decode(f.content as List<int>);
          final decoded = jsonDecode(txt);
          if (decoded is Map) {
            exportedAt = decoded['exportedAt']?.toString();
            deviceName = decoded['deviceName']?.toString();
          }
        } catch (_) {}
      }
    }

    for (final f in archive) {
      if (!f.isFile) continue;
      final n = f.name.replaceAll('\\', '/');
      if (n.endsWith('data/patients.json')) {
        try {
          patientsTxt = utf8.decode(f.content as List<int>);
        } catch (_) {}
      } else if (n.endsWith('data/entries.json')) {
        try {
          entriesTxt = utf8.decode(f.content as List<int>);
        } catch (_) {}
      }
    }

    int patientsCount = 0;
    int entriesCount = 0;

    try {
      final decoded = patientsTxt != null ? jsonDecode(patientsTxt) : [];
      patientsCount = decoded is List ? decoded.length : 0;
    } catch (_) {
      patientsCount = 0;
    }

    try {
      final decoded = entriesTxt != null ? jsonDecode(entriesTxt) : [];
      entriesCount = decoded is List ? decoded.length : 0;
    } catch (_) {
      entriesCount = 0;
    }

    return {
      "zipName": zipName,
      "patientsCount": patientsCount,
      "entriesCount": entriesCount,
      "exportedAt": exportedAt,
      "deviceName": deviceName,
    };
  }

  Future<bool> _confirmImport(Map<String, dynamic> summary) async {
    final dlgCtx = _navKey.currentContext;
    if (dlgCtx == null) return false;

    final pCount = summary["patientsCount"];
    final eCount = summary["entriesCount"];
    final exportedAt = _isoShort(summary["exportedAt"]?.toString());
    final deviceName =
        (summary["deviceName"]?.toString().isNotEmpty ?? false)
            ? summary["deviceName"].toString()
            : "desconocido";

    final msg = [
      "Este zip tiene $pCount pacientes y $eCount entradas.",
      "Exportado: $exportedAt",
      "Origen: $deviceName",
      "",
      "Al importar se REEMPLAZA todo lo local.",
      "¿Querés importar ahora?"
    ].join("\n");

    final confirmed = await showDialog<bool>(
      context: dlgCtx,
      barrierDismissible: true,
      builder: (_) => AlertDialog(
        title: const Text("Confirmar importación"),
        content: Text(msg),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(dlgCtx).pop(false),
            child: const Text("Cancelar"),
          ),
          ElevatedButton(
            onPressed: () => Navigator.of(dlgCtx).pop(true),
            child: const Text("Importar"),
          ),
        ],
      ),
    );

    return confirmed == true;
  }

  @override
  Widget build(BuildContext context) {
    if (!ready) {
      return MaterialApp(
        navigatorKey: _navKey,
        home: const Scaffold(
          body: Center(
            child: CircularProgressIndicator(),
          ),
        ),
      );
    }

    return MaterialApp(
      navigatorKey: _navKey,
      home: Scaffold(
        body: SafeArea(
          child: InAppWebView(
            initialUrlRequest: URLRequest(
              url: WebUri("http://localhost:8080/webapp/index.html"),
            ),
            initialSettings: InAppWebViewSettings(
              cacheEnabled: false,
              clearCache: true,
              isInspectable: true,
              allowFileAccessFromFileURLs: true,
              allowUniversalAccessFromFileURLs: true,
              mediaPlaybackRequiresUserGesture: false,
            ),
            onWebViewCreated: (c) {
              controller = c;

              // -----------------------------
              // Utilidades
              // -----------------------------
              c.addJavaScriptHandler(
                handlerName: "openPath",
                callback: (args) async {
                  final payload = (args.isNotEmpty ? args[0] : {}) as Map;
                  final path = payload["path"]?.toString() ?? "";
                  if (path.isEmpty) return {"ok": false};

                  final res = await OpenFilex.open(path);
                  return {"ok": res.type == ResultType.done};
                },
              );

              c.addJavaScriptHandler(
                handlerName: "openAttachment",
                callback: (args) async {
                  final payload = (args.isNotEmpty ? args[0] : {}) as Map;
                  final relPath = payload["relPath"]?.toString() ?? "";
                  final ok = await storage.openAttachment(relPath);
                  return {"ok": ok};
                },
              );

              c.addJavaScriptHandler(
                handlerName: "getMeta",
                callback: (args) async {
                  return await storage.getMeta();
                },
              );

              // -----------------------------
              // Historia Clínica
              // -----------------------------
              c.addJavaScriptHandler(
                handlerName: "openHtmlFile",
                callback: (args) async {
                  try {
                    final payload = (args.isNotEmpty ? args[0] : {}) as Map;
                    final html = payload["html"]?.toString() ?? "";
                    final filename = (payload["filename"]?.toString().isNotEmpty ?? false)
                        ? payload["filename"].toString()
                        : "HistoriaClinica.html";

                    final tempDir = await getTemporaryDirectory();
                    final filePath = p.join(tempDir.path, filename);
                    await File(filePath).writeAsString(html, flush: true);

                    final res = await OpenFilex.open(filePath);
                    if (res.type == ResultType.done) {
                      return {"ok": true};
                    } else {
                      return {"ok": false, "error": res.message};
                    }
                  } catch (e) {
                    return {"ok": false, "error": e.toString()};
                  }
                },
              );

              c.addJavaScriptHandler(
                handlerName: "getConfig",
                callback: (args) async {
                  return await storage.getConfig();
                },
              );

              c.addJavaScriptHandler(
                handlerName: "saveConfig",
                callback: (args) async {
                  final payload = (args.isNotEmpty ? args[0] : {}) as Map;
                  final data = Map<String, dynamic>.from(payload);
                  await storage.saveConfig(data);
                  return {"ok": true};
                },
              );

              // -----------------------------
              // Pacientes
              // -----------------------------
              c.addJavaScriptHandler(
                handlerName: "listPatients",
                callback: (args) async {
                  return await storage.listPatients();
                },
              );

              c.addJavaScriptHandler(
                handlerName: "upsertPatient",
                callback: (args) async {
                  final payload = (args.isNotEmpty ? args[0] : {}) as Map;
                  final patient =
                      Map<String, dynamic>.from(payload["patient"] as Map);
                  await storage.upsertPatient(patient);
                  return {"ok": true};
                },
              );

              // -----------------------------
              // Entradas
              // -----------------------------
              c.addJavaScriptHandler(
                handlerName: "listEntries",
                callback: (args) async {
                  final payload = (args.isNotEmpty ? args[0] : {}) as Map;
                  final patientId = payload["patientId"].toString();
                  return await storage.listEntries(patientId);
                },
              );

              c.addJavaScriptHandler(
                handlerName: "updateEntry",
                callback: (args) async {
                  final payload = (args.isNotEmpty ? args[0] : {}) as Map;
                  final entry =
                      Map<String, dynamic>.from(payload["entry"] as Map);

                  final files = (payload["files"] as List? ?? [])
                      .map((e) => Map<String, dynamic>.from(e as Map))
                      .toList();

                  final removeRelPaths = (payload["removeRelPaths"] as List? ?? [])
                      .map((e) => e.toString())
                      .toList();

                  await storage.updateEntryWithAttachments(
                    entry: entry,
                    filesBase64: files,
                    removeRelPaths: removeRelPaths,
                  );

                  return {"ok": true};
                },
              );

              c.addJavaScriptHandler(
                handlerName: "addEntry",
                callback: (args) async {
                  final payload = (args.isNotEmpty ? args[0] : {}) as Map;
                  final entry =
                      Map<String, dynamic>.from(payload["entry"] as Map);
                  final files = (payload["files"] as List? ?? [])
                      .map((e) => Map<String, dynamic>.from(e as Map))
                      .toList();
                  await storage.addEntryWithAttachments(entry, files);
                  return {"ok": true};
                },
              );

              // -----------------------------
              // EXPORT
              // -----------------------------
              c.addJavaScriptHandler(
                handlerName: "exportSnapshotZip",
                callback: (args) async {
                  try {
                    final tempZipPath = await storage.exportSnapshotZip();
                    const fileName = "KineHistorial_snapshot.zip";

                    if (Platform.isAndroid) {
                      final savedUri = await FlutterFileDialog.saveFile(
                        params: SaveFileDialogParams(
                          sourceFilePath: tempZipPath,
                          fileName: fileName,
                          mimeTypesFilter: ["application/zip"],
                        ),
                      );

                      if (savedUri == null) {
                        return {"ok": false, "cancelled": true};
                      }

                      return {
                        "ok": true,
                        "fileName": fileName,
                        "uri": savedUri,
                      };
                    }

                    final savePath = await FilePicker.platform.saveFile(
                      dialogTitle: "Guardar snapshot ZIP",
                      fileName: fileName,
                      type: FileType.custom,
                      allowedExtensions: ["zip"],
                    );

                    if (savePath == null || savePath.trim().isEmpty) {
                      return {
                        "ok": true,
                        "warning":
                            "No se pudo abrir 'Guardar como...'. Se dejó en temporal.",
                        "tmpPath": tempZipPath,
                      };
                    }

                    await File(tempZipPath).copy(savePath);

                    return {
                      "ok": true,
                      "fileName": fileName,
                      "path": savePath,
                    };
                  } catch (e) {
                    return {"ok": false, "error": e.toString()};
                  }
                },
              );

              // -----------------------------
              // IMPORT
              // -----------------------------
              c.addJavaScriptHandler(
                handlerName: "importSnapshotZip",
                callback: (args) async {
                  try {
                    final res = await FilePicker.platform.pickFiles(
                      type: FileType.custom,
                      allowedExtensions: ["zip"],
                      withData: true,
                    );

                    if (res == null || res.files.isEmpty) {
                      return {"ok": false, "cancelled": true};
                    }

                    final f = res.files.single;
                    final zipName = f.name;

                    String zipPathToUse = "";

                    if (f.bytes != null && f.bytes!.isNotEmpty) {
                      final tmpDir = await getTemporaryDirectory();
                      zipPathToUse = p.join(
                        tmpDir.path,
                        "import_${DateTime.now().millisecondsSinceEpoch}_${zipName.replaceAll(' ', '_')}",
                      );
                      await File(zipPathToUse)
                          .writeAsBytes(f.bytes!, flush: true);
                    } else if (f.path != null && f.path!.isNotEmpty) {
                      zipPathToUse = f.path!;
                    } else {
                      return {
                        "ok": false,
                        "error":
                            "No se pudo leer el ZIP (sin path y sin bytes).",
                      };
                    }

                    final summary = await _inspectZipSummary(
                      zipPathToUse,
                      zipName: zipName,
                    );

                    final confirmed = await _confirmImport(summary);
                    if (!confirmed) {
                      return {"ok": false, "cancelled": true};
                    }

                    await storage.importSnapshotZip(zipPathToUse);
                    await controller?.reload();

                    return {"ok": true, "summary": summary};
                  } catch (e) {
                    return {"ok": false, "error": e.toString()};
                  }
                },
              );
            },
          ),
        ),
      ),
    );
  }

  @override
  void dispose() {
    localhostServer.close();
    super.dispose();
  }
}