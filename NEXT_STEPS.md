# LectureGraph — güncel durum ve sonraki adımlar

Bu belge mevcut koddan devam edecek geliştirici/ajan içindir. `README.md` ve ilgili kodu doğrula; `ROADMAP.md` hedefleri ve işaretlenmemiş kutuları uygulamanın güncel durumunu yansıtmayabilir. Mevcut değişiklikleri silme veya üzerine yazma.

## Yapılmış olanlar

- Django/Next.js yerel demosunda ders oluşturma, transkript/slayt/sınav materyali yükleme, gerçek sayfa veya zaman bilgisiyle `SourceChunk` çıkarma ve numaralı sınav sorularını görüntüleme var. Soru–kaynak eşleştirmesi aynı dersteki gerçek parçalardan yapılıyor; OpenRouter yeniden sıralaması isteğe bağlı.
- MP4/MP3 kaydı ayrı `/api/courses/{id}/recordings/` endpoint'ine yükleniyor. HTTP isteği dışında çalışan worker, FFmpeg ve OpenAI Whisper ile transkript oluşturuyor; iş durumu ve transkript görüntülenebiliyor. Bu akış canlı sağlayıcıyla uçtan uca doğrulanmış sayılmamalı.
- `backend/knowledge/` içinde ders kapsamlı `Topic`, `TopicSourceLink` ve `QuestionTopicLink` modelleri, migration, yerel/isteğe bağlı OpenRouter üretimi ve `GET /api/courses/{id}/knowledge/` ile `POST .../generate/` var. Frontend'de konu → soru/kaynak gezintisi mevcut. Üretim açıkça tetikleniyor; doğrulanmamış kaynak ID'leri kabul edilmiyor ve sağlayıcı hatası önceki grafı silmiyor. Bu, akademik olarak doğrulanmış bir ontoloji değil; metinden çıkarılmış kaynaklı konu haritası.
- Soru–kaynak eşleştirmesi ve konu grafı sitedeki ayrı yeniden analiz butonlarıyla çalıştırılabiliyor; sonuçları görüntülemek OpenRouter çağrısı başlatmıyor. OpenRouter yapılandırılmışsa eşleştirme hatası açıkça gösterilir, kayıtlı sonuçlar korunur; anahtar yapılandırılmamışsa yerel anahtar kelime eşleştirmesi çalışır.
- `exams/` içinde soruya dayalı, en fazla üç turlu metin sözlü sınavı ve kaynaklı rapor var. Oturum ve yanıtlar saklanıyor; site yenilendiğinde oturum geri yükleniyor. Başlamak için önceden analiz edilmiş gerçek soru kaynakları ve backend OpenRouter yapılandırması gerekiyor. Geçersiz kaynak ID'si veya sağlayıcı hatası yanıtı kaydetmiyor; ücretli çağrılar yalnızca yanıt gönderilirken yapılıyor. Bu akışın canlı sağlayıcıyla uçtan uca doğrulaması henüz yapılmadı.

- Dersin **Flashcards** ekranında kaynaklı konulardan veya tamamlanan sözlü sınavın kaynakla eşleşen eksik kavramlarından boşluk doldurma kartları üretiliyor. Yanıt açma ve Known / Review Again durumu mevcut.

## 1. Öncelik: P0 uçtan uca doğrulama

- İzinli gerçek materyalle ders → kayıt/transkript → slayt/sınav → kaynak eşleştirmesi → konu grafı → sözlü sınav → rapor akışını yerel PostgreSQL ve çalışan worker üzerinde doğrula. Özellikle Whisper/OpenRouter erişimini, gerçek zaman damgalarını, kaynak bağlantılarını ve sağlayıcı hatalarını kontrol et. Ücretli çağrılar veya gerçek materyali sağlayıcıya gönderme için önceden izin al; testlerde HTTP'yi mock'la.
- Sözlü sınav yalnızca analiz edilmiş geçmiş sınav sorusundan başlıyor; konuya doğrudan başlama, offline değerlendirme ve tutar bazında bütçe takibi henüz yok. Bunları ancak demo gerektiriyorsa ekle; yanlış güven yaratan sahte değerlendirme üretme.
- `ROADMAP.md` içindeki eski P0/P1 kutularını ve çelişen açıklamaları, doğrulanan uygulama durumuna göre güncelle.

## 2. P0 sonrasında isteğe bağlı

- P1: yalnızca ihtiyaç çıkarsa sınırlı rol orkestrasyonu.
- P2/üretim: kimlik doğrulama ve güvenli barındırma, ölçekli worker/depolama, OCR, sesli sınav ve öğretim üyesi paneli. Yerel demo için bunlar önkoşul değil.

## Çalışma ve güvenlik sınırı

Küçük dilimler halinde ilerle; var olan upload, transkripsiyon, eşleştirme ve graf yollarını bozma. Backend için `DB_ENGINE=sqlite .venv/bin/python manage.py test` ve `DB_ENGINE=sqlite .venv/bin/python manage.py check`; frontend için `npm run typecheck` ve `npm run build` çalıştır. Çalıştırılmayan kontrolleri başarılı diye raporlama. Demo kimlik doğrulamasız ve yalnızca izole localhost için: internete açma, tünelleme veya dışarıdan erişilen proxy arkasına koyma. `OPENAI_API_KEY` ve `OPENROUTER_API_KEY` yalnızca backend ortamında kalsın.
