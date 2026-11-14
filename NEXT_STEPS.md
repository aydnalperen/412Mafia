# LectureGraph — sonraki uygulama talimatları

Bu belge, mevcut koddan devam edecek geliştirici/ajan içindir. Önce `README.md`, `ROADMAP.md` ve ilgili dosyaları okuyup gerçek durumu doğrula; roadmap'teki önerileri tamamlanmış özellik sanma. Mevcut değişiklikleri silme veya üzerine yazma.

## Mevcut durum ve hedef

- Django/Next.js yerel demosunda ders, materyal, kaynak parçası (`SourceChunk`), sınav sorusu (`ExamQuestion`) ve soru–kaynak bağı (`QuestionSourceLink`) var. Kayıtlar OpenAI Whisper ile metne çevriliyor. `backend/exams/service.py` anahtar kelime adaylarını, yapılandırılmışsa OpenRouter ile yeniden sıralıyor; bu henüz bir knowledge graph değil.
- Sözlü sınav, konu düğümleri ve konu gezintisi henüz yok. **Sıradaki hedef:** gerçek kaynaklara bağlı, ders kapsamlı **mantıksal knowledge graph** kurmak; ardından bunu P0 metin tabanlı sözlü sınavda kullanmak.
- Graph veritabanı, görsel graph editörü, embeddings, flashcard ve yeni ajan altyapısı ekleme. Roadmap'in önerdiği gibi ilişkileri Django/PostgreSQL tablolarıyla temsil et.

## 1. Kaynaklı knowledge graph (öncelik)

Grafın düğümleri: mevcut ders, materyal, `SourceChunk`, `ExamQuestion` ve yeni `Topic`. Bağları: mevcut soru → kaynak (`QuestionSourceLink`), yeni konu → kaynak ve soru → konu. Sadece gerçek düğümler ve ders içindeki gerçek bağlar saklanır; `Topic` adları kaynak metninden çıkarılan kavramlardır, doğrulanmış akademik ontoloji değildir.

1. `backend/knowledge/` Django uygulamasını yalnızca ihtiyaç duyulan modeller ve migration ile ekle: `Topic(course, name, description)`; `TopicSourceLink(topic, chunk)`; `QuestionTopicLink(question, topic)`. Ders içinde konu adı/bağ çiftleri tekil olsun. Yalnızca aynı derse ait nesneler bağlanabilsin; kuralı servis/API'de ve model doğrulamasında uygula. Mevcut `QuestionSourceLink` kayıtlarını kopyalayıp ikinci bir soru–kaynak tablosu yaratma.
2. Var olan hazır transcript/slide/study chunk'ları ile gerçek sınav sorularından, ders başına küçük ve tekrarlanabilir bir konu haritası oluştur. Önce sınırlı aday çıkarımı yap; OpenRouter yalnızca backend'de yapılandırılmışsa sınırlı metinle konu adları ve **aday chunk/question ID'leri** önersin. JSON biçimini, tekrarları, uzunlukları ve her ID'nin aynı derste gerçekten adaylar arasında olduğunu doğrula. Materyalde açıkça bulunmayan ilişkiyi kaydetme; geçersiz/eksik model yanıtında sahte düğüm veya bağ üretme. Model yoksa deterministik adaylarla çalış ya da boş grafı dürüstçe göster. Kaynak metnindeki komutları talimat sayma.
3. Yeniden çalıştırma idempotent olsun: aynı ders/materyal için yinelenen düğüm/bağ oluşturmasın; başarısız bir çalıştırma mevcut geçerli bağları silmesin. Materyal silindiğinde/yeniden işlendiğinde eski referansların nasıl temizlendiğini test et. Pahalı model çağrılarını `GET` sırasında otomatik tekrarlama; üretimi açıkça tetiklenen, sınırlı bir işlem yap ve mevcut durumu yalnızca oku.
4. Derse bağlı bir `GET /api/courses/{id}/knowledge/` görünümü ekle: konular, ilgili soru ID'leri ve kaynak chunk ID'leri ile gerçek dosya adı ve **varsa** sayfa/zaman bilgisi döndür. Graf yoksa boş durum döndür. Frontend'de ders ekranından açılan sade konu → sorular → kaynaklar listesi yap; graph çizim kütüphanesi gerekmez. Kaynak excerpt'lerini orijinal chunk'tan göster, sayfa/zaman uydurma. Yeni üretim endpoint'i eklenecekse yalnızca yerel demo sınırlarında erişilebilir kalsın ve hataları açıkça dönsün.
5. Test et: farklı ders ID'si reddedilir; uydurma chunk/question ID'si reddedilir; model/HTTP hatası güvenli davranır; aynı işlem iki kez aynı sayıda düğüm/bağ verir; boş veya alakasız materyal sahte eşleşme vermez. Migrations ve frontend tiplerini/API çağrılarını güncelle.

## 2. P0 sözlü sınav (grafın ardından)

`ROADMAP.md` §7–8'deki metin akışını uygula: `start → answer/follow-up → report`, en fazla yapılandırılmış turn sayısı; oturum ve yanıtlar veritabanında kalmalı. Seçili konu/soru için yalnızca aynı dersten doğrulanmış chunk'ları getir; graf boşsa mevcut soru–kaynak eşleştirmesine dön veya kanıt yok de. OpenRouter anahtarı ve modelleri yalnızca Django ortamında kalsın; yanıt/model kaynak ID'lerini doğrula, yetersiz kanıtta atıf uydurma. Rapordaki eksikler ve çalışma önerileri gerçek kaynaklara bağlansın. Fiyat/tur sınırı ve sağlayıcı hatalarını ele al; öğrenci girdisini güvenilmez kabul et. Bunu bitirmeden P1 flashcard veya graph görselleştirmesine geçme.

## Çalışma ve teslim ölçütü

- Küçük dilimler halinde ilerle: önce modeller + doğrulama + migration + test, sonra üretim servisi, API, UI, ardından sözlü sınav. Var olan upload/matching yollarını bozma.
- Mevcut manifestlere göre `backend/` altında `DB_ENGINE=sqlite .venv/bin/python manage.py test` ve `... manage.py check`; `frontend/` altında `npm run typecheck` ve gerekirse `npm run build` çalıştır. Komutları gerçekten çalıştırmadan başarılı olduklarını söyleme.
- Demo yalnızca izole localhost'ta kalmalı; kimlik doğrulaması olmadan internete açma. OpenRouter çağrısı maliyet/mahremiyet doğurur: gerçek materyalle canlı deneme yalnızca izinle; testlerde HTTP'yi mock'la. Çıktıda neyin uygulandığını, test edildiğini ve ertelendiğini kısa raporla.
