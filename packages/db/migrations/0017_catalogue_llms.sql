-- Le catalogue d'outils suit tools.json : cette migration amène une base qui a passé les
-- précédentes à l'état du fichier, sans toucher aux liens des projets et des profils, sauf pour
-- rattacher un « Autre » déjà tapé à l'outil du catalogue qui prend son nom ou son alias. Une
-- migration déployée ne change plus : chaque changement du catalogue a la sienne.
-- Écrite par : node packages/db/scripts/catalogue-sql.mjs --since 0016_r6b_tools
-- Ne pas la modifier à la main : la régénérer. Aucune table ne change (instantané inchangé).
-- Les outils à écrire, dans une table temporaire (elle disparaît avec la connexion ; on l'efface
-- aussi à la fin). « former » : l'ancien nom replié d'un outil renommé.
CREATE TEMP TABLE c17_tool AS
SELECT * FROM jsonb_to_recordset('[{"slug":"gpt","name":"GPT","folded":"gpt","family":"assistant","fr":"Famille de modèles de langage d’OpenAI, utilisés par son API.","en":"OpenAI’s family of language models, used through its API.","site":"https://openai.com/api/","former":null},{"slug":"mistral","name":"Mistral","folded":"mistral","family":"assistant","fr":"Famille de modèles de langage de Mistral AI, ouverts ou par API.","en":"Mistral AI’s family of language models, open or through an API.","site":"https://mistral.ai","former":null},{"slug":"llama","name":"Llama","folded":"llama","family":"assistant","fr":"Famille de modèles de langage ouverts de Meta.","en":"Meta’s family of open language models.","site":"https://www.llama.com","former":null},{"slug":"gemma","name":"Gemma","folded":"gemma","family":"assistant","fr":"Famille de modèles de langage ouverts de Google.","en":"Google’s family of open language models.","site":"https://deepmind.google/models/gemma/","former":null},{"slug":"phi","name":"Phi","folded":"phi","family":"assistant","fr":"Famille de petits modèles de langage ouverts de Microsoft.","en":"Microsoft’s family of small open language models.","site":"https://azure.microsoft.com/products/phi","former":null},{"slug":"cohere","name":"Cohere","folded":"cohere","family":"assistant","fr":"Modèles de langage Command et Aya, utilisés par l’API de Cohere.","en":"Command and Aya language models, used through Cohere’s API.","site":"https://cohere.com","former":null},{"slug":"glm","name":"GLM","folded":"glm","family":"assistant","fr":"Famille de modèles de langage de Zhipu AI, et son assistant.","en":"Zhipu AI’s family of language models, and its assistant.","site":"https://z.ai","former":null},{"slug":"minimax","name":"MiniMax","folded":"minimax","family":"assistant","fr":"Modèles de langage et assistant de MiniMax.","en":"Language models and assistant from MiniMax.","site":"https://www.minimax.io","former":null},{"slug":"nemotron","name":"Nemotron","folded":"nemotron","family":"assistant","fr":"Famille de modèles de langage ouverts de NVIDIA.","en":"NVIDIA’s family of open language models.","site":"https://www.nvidia.com/en-us/ai-data-science/foundation-models/nemotron/","former":null},{"slug":"granite","name":"Granite","folded":"granite","family":"assistant","fr":"Famille de modèles de langage ouverts d’IBM.","en":"IBM’s family of open language models.","site":"https://www.ibm.com/granite","former":null},{"slug":"olmo","name":"OLMo","folded":"olmo","family":"assistant","fr":"Modèles de langage entièrement ouverts de l’institut Ai2.","en":"Fully open language models from the Ai2 institute.","site":"https://allenai.org/olmo","former":null},{"slug":"falcon","name":"Falcon","folded":"falcon","family":"assistant","fr":"Famille de modèles de langage ouverts du Technology Innovation Institute.","en":"Family of open language models from the Technology Innovation Institute.","site":"https://falconllm.tii.ae","former":null},{"slug":"jamba","name":"Jamba","folded":"jamba","family":"assistant","fr":"Modèles de langage d’AI21 Labs.","en":"Language models from AI21 Labs.","site":"https://www.ai21.com","former":null},{"slug":"hermes","name":"Hermes","folded":"hermes","family":"assistant","fr":"Modèles de langage ouverts de Nous Research.","en":"Open language models from Nous Research.","site":"https://nousresearch.com","former":null},{"slug":"reka","name":"Reka","folded":"reka","family":"assistant","fr":"Modèles de langage et assistant de Reka AI.","en":"Language models and assistant from Reka AI.","site":"https://www.reka.ai","former":null},{"slug":"doubao","name":"Doubao","folded":"doubao","family":"assistant","fr":"Assistant conversationnel et modèles de langage de ByteDance.","en":"ByteDance’s conversational assistant and language models.","site":"https://www.doubao.com","former":null},{"slug":"ernie","name":"ERNIE","folded":"ernie","family":"assistant","fr":"Modèles de langage et assistant de Baidu.","en":"Baidu’s language models and assistant.","site":"https://yiyan.baidu.com","former":null},{"slug":"hunyuan","name":"Hunyuan","folded":"hunyuan","family":"assistant","fr":"Modèles de langage de Tencent.","en":"Tencent’s language models.","site":"https://hunyuan.tencent.com","former":null},{"slug":"manus","name":"Manus","folded":"manus","family":"assistant","fr":"Agent qui mène des tâches en plusieurs étapes à partir d’une demande écrite.","en":"Agent that carries out multi-step tasks from a written request.","site":"https://manus.im","former":null},{"slug":"apple-intelligence","name":"Apple Intelligence","folded":"appleintelligence","family":"assistant","fr":"Fonctions d’IA intégrées aux appareils d’Apple.","en":"AI features built into Apple devices.","site":"https://www.apple.com/apple-intelligence/","former":null},{"slug":"dall-e","name":"DALL-E","folded":"dalle","family":"creation","fr":"Modèle qui crée des images à partir d’une description écrite.","en":"Model that creates images from a written description.","site":null,"former":null},{"slug":"dify","name":"Dify","folded":"dify","family":"no-code","fr":"Plateforme pour construire des applications à base de modèles de langage.","en":"Platform to build applications on language models.","site":"https://dify.ai","former":null},{"slug":"flowise","name":"Flowise","folded":"flowise","family":"no-code","fr":"Outil visuel pour assembler des agents et des chaînes de modèles.","en":"Visual tool to assemble agents and model chains.","site":"https://flowiseai.com","former":null},{"slug":"langflow","name":"Langflow","folded":"langflow","family":"no-code","fr":"Outil visuel pour construire des applications à base de modèles.","en":"Visual tool to build applications on models.","site":"https://www.langflow.org","former":null},{"slug":"claude-code","name":"Claude Code","folded":"claudecode","family":"development","fr":"Assistant de programmation qui travaille dans le terminal, sur le code d’un projet.","en":"Programming assistant that works in the terminal, on a project’s code.","site":"https://claude.com/product/claude-code","former":null},{"slug":"zed","name":"Zed","folded":"zed","family":"development","fr":"Éditeur de code qui se travaille aussi à plusieurs.","en":"Code editor that several people can also use together.","site":"https://zed.dev","former":null},{"slug":"go","name":"Go","folded":"go","family":"development","fr":"Langage de programmation compilé, créé chez Google.","en":"Compiled programming language created at Google.","site":"https://go.dev","former":null},{"slug":"openrouter","name":"OpenRouter","folded":"openrouter","family":"development","fr":"Service qui donne accès à de nombreux modèles de langage par une seule API.","en":"Service that gives access to many language models through a single API.","site":"https://openrouter.ai","former":null},{"slug":"groq","name":"Groq","folded":"groq","family":"development","fr":"Service qui fait tourner des modèles de langage ouverts par une API.","en":"Service that runs open language models through an API.","site":"https://groq.com","former":null},{"slug":"together-ai","name":"Together AI","folded":"togetherai","family":"development","fr":"Service qui fait tourner et affine des modèles ouverts par une API.","en":"Service that runs and fine-tunes open models through an API.","site":"https://www.together.ai","former":null},{"slug":"replicate","name":"Replicate","folded":"replicate","family":"development","fr":"Service qui fait tourner des modèles d’IA par une API.","en":"Service that runs AI models through an API.","site":"https://replicate.com","former":null},{"slug":"fireworks-ai","name":"Fireworks AI","folded":"fireworksai","family":"development","fr":"Service qui fait tourner des modèles ouverts par une API.","en":"Service that runs open models through an API.","site":"https://fireworks.ai","former":null},{"slug":"amazon-bedrock","name":"Amazon Bedrock","folded":"amazonbedrock","family":"development","fr":"Service d’Amazon Web Services qui donne accès à plusieurs modèles par une API.","en":"Amazon Web Services offering that gives access to several models through an API.","site":"https://aws.amazon.com/bedrock/","former":null},{"slug":"vertex-ai","name":"Vertex AI","folded":"vertexai","family":"development","fr":"Plateforme d’IA de Google Cloud, pour utiliser et entraîner des modèles.","en":"Google Cloud’s AI platform, to use and train models.","site":"https://cloud.google.com/vertex-ai","former":null},{"slug":"azure-ai-foundry","name":"Azure AI Foundry","folded":"azureaifoundry","family":"development","fr":"Plateforme de Microsoft Azure pour utiliser des modèles d’IA.","en":"Microsoft Azure platform to use AI models.","site":"https://ai.azure.com","former":null},{"slug":"llama-cpp","name":"llama.cpp","folded":"llamacpp","family":"development","fr":"Programme qui fait tourner des modèles de langage sur son propre ordinateur.","en":"Program that runs language models on your own computer.","site":"https://github.com/ggml-org/llama.cpp","former":null},{"slug":"vllm","name":"vLLM","folded":"vllm","family":"development","fr":"Serveur qui fait tourner des modèles de langage ouverts.","en":"Server that runs open language models.","site":"https://docs.vllm.ai","former":null},{"slug":"jan","name":"Jan","folded":"jan","family":"development","fr":"Application qui fait tourner des modèles de langage hors ligne.","en":"App that runs language models offline.","site":"https://jan.ai","former":null},{"slug":"gpt4all","name":"GPT4All","folded":"gpt4all","family":"development","fr":"Application qui fait tourner des modèles de langage sur son ordinateur.","en":"App that runs language models on your computer.","site":"https://www.nomic.ai/gpt4all","former":null},{"slug":"open-webui","name":"Open WebUI","folded":"openwebui","family":"development","fr":"Interface web pour discuter avec des modèles locaux ou distants.","en":"Web interface to chat with local or remote models.","site":"https://openwebui.com","former":null},{"slug":"litellm","name":"LiteLLM","folded":"litellm","family":"development","fr":"Bibliothèque qui appelle de nombreux modèles par une même interface.","en":"Library that calls many models through one interface.","site":"https://www.litellm.ai","former":null},{"slug":"llamaindex","name":"LlamaIndex","folded":"llamaindex","family":"development","fr":"Bibliothèque pour relier des modèles de langage à ses propres données.","en":"Library to connect language models to your own data.","site":"https://www.llamaindex.ai","former":null},{"slug":"crewai","name":"CrewAI","folded":"crewai","family":"development","fr":"Bibliothèque pour faire travailler plusieurs agents ensemble.","en":"Library to make several agents work together.","site":"https://www.crewai.com","former":null},{"slug":"autogen","name":"AutoGen","folded":"autogen","family":"development","fr":"Bibliothèque de Microsoft pour construire des systèmes de plusieurs agents.","en":"Microsoft library to build multi-agent systems.","site":"https://microsoft.github.io/autogen/","former":null},{"slug":"gnu-make","name":"GNU Make","folded":"gnumake","family":"development","fr":"Outil qui construit un programme en suivant les règles d’un Makefile.","en":"Tool that builds a program by following the rules of a Makefile.","site":"https://www.gnu.org/software/make/","former":null},{"slug":"flipper-zero","name":"Flipper Zero","folded":"flipperzero","family":"hardware","fr":"Petit appareil portable pour explorer des signaux radio et des protocoles.","en":"Small portable device for exploring radio signals and protocols.","site":"https://flipper.net","former":null},{"slug":"nvidia-jetson","name":"NVIDIA Jetson","folded":"nvidiajetson","family":"hardware","fr":"Gamme de petits ordinateurs sur carte de NVIDIA, pensés pour faire tourner de l’IA.","en":"NVIDIA’s range of small single-board computers, designed to run AI.","site":"https://developer.nvidia.com/embedded-computing","former":"jetsonnano"}]'::jsonb)
  AS e(slug text, name text, folded text, family text, fr text, en text, site text, former text);
--> statement-breakpoint
-- Les alias retirés de tools.json. D'abord, pour qu'un nom qui devient un outil (« GPT »)
-- n'existe jamais à la fois comme outil et comme alias (sec-A3). Les projets rattachés par cet
-- alias en 0016 gardent leur outil : on ne touche pas aux liens existants.
DELETE FROM "tool_alias"
WHERE "folded" IN (SELECT jsonb_array_elements_text('["gpt","mistral","nvidiajetson"]'::jsonb));
--> statement-breakpoint
-- Le rattachement d'un « Autre » (ou d'un outil écarté) à un outil du catalogue, recopié de
-- mergeTool (apps/api/src/catalogue/admin.ts) : chaque projet et chaque profil qui le citent citent
-- l'outil, sans doublon, à la place la plus haute des deux, sans nom tapé (sec-B8) ; son nom devient
-- un alias de l'outil, son adresse y mène, et l'« Autre » est effacé. Une fonction PL/pgSQL
-- (le langage de programmes de PostgreSQL) « temporaire » : elle vit dans pg_temp, le temps de la
-- connexion, et la migration l'efface à la fin.
CREATE FUNCTION pg_temp.c17_merge(from_id uuid, into_id uuid) RETURNS void LANGUAGE plpgsql AS $c17$
BEGIN
  UPDATE "project_tool" AS kept SET "position" = moved."position"
  FROM "project_tool" AS moved
  WHERE moved."tool_id" = from_id AND kept."tool_id" = into_id
    AND kept."project_id" = moved."project_id" AND moved."position" < kept."position";
  DELETE FROM "project_tool" AS moved
  WHERE moved."tool_id" = from_id AND EXISTS (SELECT 1 FROM "project_tool" AS kept
    WHERE kept."tool_id" = into_id AND kept."project_id" = moved."project_id");
  UPDATE "project_tool" SET "tool_id" = into_id, "label" = NULL WHERE "tool_id" = from_id;
  UPDATE "profile_tool" AS kept SET "position" = moved."position"
  FROM "profile_tool" AS moved
  WHERE moved."tool_id" = from_id AND kept."tool_id" = into_id
    AND kept."user_id" = moved."user_id" AND moved."position" < kept."position";
  DELETE FROM "profile_tool" AS moved
  WHERE moved."tool_id" = from_id AND EXISTS (SELECT 1 FROM "profile_tool" AS kept
    WHERE kept."tool_id" = into_id AND kept."user_id" = moved."user_id");
  UPDATE "profile_tool" SET "tool_id" = into_id, "label" = NULL WHERE "tool_id" = from_id;
  INSERT INTO "tool_alias" ("folded", "tool_id")
  SELECT "folded", into_id FROM "tool" WHERE "id" = from_id ON CONFLICT DO NOTHING;
  INSERT INTO "tool_slug_redirect" ("slug", "tool_id")
  SELECT "slug", into_id FROM "tool" WHERE "id" = from_id ON CONFLICT DO NOTHING;
  DELETE FROM "tool" WHERE "id" = from_id;
END
$c17$;
--> statement-breakpoint
-- La première adresse libre « base-2 », « base-3 »… : aucun outil (sauf « me ») ni aucune
-- ancienne adresse ne la porte (index unique de tool.slug, clé primaire des redirections). La
-- boucle s'arrête toujours : les outils sont en nombre fini.
CREATE FUNCTION pg_temp.c17_free_slug(base text, me uuid) RETURNS text LANGUAGE plpgsql AS $c17$
DECLARE
  n int := 1;
BEGIN
  LOOP
    n := n + 1;
    EXIT WHEN NOT EXISTS (SELECT 1 FROM "tool" t WHERE t."slug" = base || '-' || n AND t."id" IS DISTINCT FROM me)
      AND NOT EXISTS (SELECT 1 FROM "tool_slug_redirect" r WHERE r."slug" = base || '-' || n);
  END LOOP;
  RETURN base || '-' || n;
END
$c17$;
--> statement-breakpoint
-- Chaque outil à écrire, un par un (un bloc DO est un petit programme que PostgreSQL exécute une
-- fois) :
-- 1. son outil du catalogue : celui qui porte son nom replié, sinon, pour un renommage, l'ancien ;
-- 2. un « Autre » (ou un outil écarté) du même nom replié, tapé par des membres depuis 0016 :
--    s'il n'y a pas d'outil, il ENTRE au catalogue sur place (le geste « Admettre » de
--    l'administration : mêmes projets, noms tapés effacés) ; s'il y en a un (un renommage vers un
--    nom déjà tapé), il y est RATTACHÉ (c17_merge) ;
-- 3. son adresse, pour un outil neuf, admis ou renommé : celle de tools.json. Un « Autre » qui la
--    porte (« Gemma ✨ » a l'adresse gemma) passe à la suivante libre : la page d'un « Autre »
--    n'existe pas (404), son adresse ne mène nulle part. Un outil du catalogue qui la porte la
--    garde, et le nouvel outil prend la suivante. Une ancienne adresse égale s'efface (une adresse
--    n'est jamais à la fois celle d'un outil et une redirection, sec-A2) ; renommé, l'outil garde
--    son ancienne adresse comme redirection, comme après un renommage de l'administration ;
-- 4. ses champs, tels que tools.json les donne.
DO $c17$
DECLARE
  e record;
  target uuid;
  old_slug text;
  renamed boolean;
  admitted boolean;
  other record;
  holder record;
  wanted text;
BEGIN
  FOR e IN SELECT * FROM c17_tool ORDER BY folded LOOP
    target := NULL;
    old_slug := NULL;
    renamed := false;
    admitted := false;
    SELECT t."id", t."slug" INTO target, old_slug FROM "tool" t
    WHERE t."status" = 'catalogue' AND t."folded" = e.folded;
    IF target IS NULL AND e.former IS NOT NULL THEN
      SELECT t."id", t."slug" INTO target, old_slug FROM "tool" t
      WHERE t."status" = 'catalogue' AND t."folded" = e.former;
      renamed := target IS NOT NULL;
    END IF;
    SELECT t."id", t."slug" INTO other FROM "tool" t
    WHERE t."status" <> 'catalogue' AND t."folded" = e.folded;
    IF other.id IS NOT NULL AND target IS NULL THEN
      target := other.id;
      old_slug := other.slug;
      admitted := true;
      UPDATE "tool" SET "status" = 'catalogue', "admitted_at" = now() WHERE "id" = target;
      UPDATE "project_tool" SET "label" = NULL WHERE "tool_id" = target;
      UPDATE "profile_tool" SET "label" = NULL WHERE "tool_id" = target;
    ELSIF other.id IS NOT NULL THEN
      PERFORM pg_temp.c17_merge(other.id, target);
    END IF;
    IF target IS NULL OR renamed OR admitted THEN
      wanted := e.slug;
      SELECT t."id", t."status" INTO holder FROM "tool" t
      WHERE t."slug" = e.slug AND t."id" IS DISTINCT FROM target;
      IF holder.id IS NOT NULL AND holder.status = 'catalogue' THEN
        wanted := pg_temp.c17_free_slug(e.slug, target);
      ELSIF holder.id IS NOT NULL THEN
        UPDATE "tool" SET "slug" = pg_temp.c17_free_slug(e.slug, holder.id) WHERE "id" = holder.id;
      END IF;
      DELETE FROM "tool_slug_redirect" WHERE "slug" = wanted;
      IF target IS NULL THEN
        INSERT INTO "tool" ("id", "slug", "name", "folded", "status", "family", "description_fr", "description_en", "site_url", "created_at", "created_by", "admitted_at")
        VALUES (gen_random_uuid(), wanted, e.name, e.folded, 'catalogue', e.family, e.fr, e.en, e.site, now(), NULL, now())
        RETURNING "id" INTO target;
      ELSE
        UPDATE "tool" SET "slug" = wanted WHERE "id" = target;
        IF renamed AND old_slug <> wanted THEN
          INSERT INTO "tool_slug_redirect" ("slug", "tool_id") VALUES (old_slug, target) ON CONFLICT DO NOTHING;
        END IF;
      END IF;
    END IF;
    UPDATE "tool" SET "name" = e.name, "folded" = e.folded, "family" = e.family,
      "description_fr" = e.fr, "description_en" = e.en, "site_url" = e.site
    WHERE "id" = target;
  END LOOP;
END
$c17$;
--> statement-breakpoint
-- Les alias ajoutés ou déplacés. « ON CONFLICT … DO UPDATE » : un alias qui existe déjà (sa clé
-- primaire est son nom replié) change d'outil au lieu d'arrêter la migration ; c'est ce qui permet
-- à un alias de passer d'un outil à un autre en une seule instruction.
INSERT INTO "tool_alias" ("folded", "tool_id")
SELECT a.folded, t."id"
FROM jsonb_to_recordset('[{"folded":"claudesonnet","tool":"claude"},{"folded":"claudeopus","tool":"claude"},{"folded":"claudehaiku","tool":"claude"},{"folded":"geminipro","tool":"gemini"},{"folded":"geminiflash","tool":"gemini"},{"folded":"xai","tool":"grok"},{"folded":"deepseekr1","tool":"deepseek"},{"folded":"deepseekv3","tool":"deepseek"},{"folded":"moonshotai","tool":"kimi"},{"folded":"kimik2","tool":"kimi"},{"folded":"qwen3","tool":"qwen"},{"folded":"qwq","tool":"qwen"},{"folded":"gpt4","tool":"gpt"},{"folded":"gpt4o","tool":"gpt"},{"folded":"gpt41","tool":"gpt"},{"folded":"gpt5","tool":"gpt"},{"folded":"openaiapi","tool":"gpt"},{"folded":"gptoss","tool":"gpt"},{"folded":"mistralai","tool":"mistral"},{"folded":"mixtral","tool":"mistral"},{"folded":"codestral","tool":"mistral"},{"folded":"devstral","tool":"mistral"},{"folded":"magistral","tool":"mistral"},{"folded":"ministral","tool":"mistral"},{"folded":"metallama","tool":"llama"},{"folded":"llama3","tool":"llama"},{"folded":"llama4","tool":"llama"},{"folded":"codellama","tool":"llama"},{"folded":"googlegemma","tool":"gemma"},{"folded":"codegemma","tool":"gemma"},{"folded":"microsoftphi","tool":"phi"},{"folded":"phi3","tool":"phi"},{"folded":"phi4","tool":"phi"},{"folded":"commandr","tool":"cohere"},{"folded":"commanda","tool":"cohere"},{"folded":"aya","tool":"cohere"},{"folded":"chatglm","tool":"glm"},{"folded":"zhipu","tool":"glm"},{"folded":"zhipuai","tool":"glm"},{"folded":"zai","tool":"glm"},{"folded":"nvidianemotron","tool":"nemotron"},{"folded":"ibmgranite","tool":"granite"},{"folded":"ai2olmo","tool":"olmo"},{"folded":"falconllm","tool":"falcon"},{"folded":"ai21","tool":"jamba"},{"folded":"ai21labs","tool":"jamba"},{"folded":"noushermes","tool":"hermes"},{"folded":"nousresearch","tool":"hermes"},{"folded":"rekaai","tool":"reka"},{"folded":"erniebot","tool":"ernie"},{"folded":"wenxinyiyan","tool":"ernie"},{"folded":"tencenthunyuan","tool":"hunyuan"},{"folded":"groqcloud","tool":"groq"},{"folded":"fireworks","tool":"fireworksai"},{"folded":"bedrock","tool":"amazonbedrock"},{"folded":"awsbedrock","tool":"amazonbedrock"},{"folded":"googlevertexai","tool":"vertexai"},{"folded":"azureopenai","tool":"azureaifoundry"},{"folded":"azureai","tool":"azureaifoundry"},{"folded":"janai","tool":"jan"},{"folded":"makefile","tool":"gnumake"},{"folded":"jetsonnano","tool":"nvidiajetson"},{"folded":"jetsonorin","tool":"nvidiajetson"},{"folded":"jetson","tool":"nvidiajetson"}]'::jsonb) AS a(folded text, tool text)
JOIN "tool" t ON t."folded" = a.tool AND t."status" = 'catalogue'
ON CONFLICT ("folded") DO UPDATE SET "tool_id" = excluded."tool_id";
--> statement-breakpoint
-- Un « Autre » (ou un outil écarté) dont le nom est désormais l'alias d'un outil du catalogue
-- (« Meta Llama ») y est rattaché : sinon qui tape « Meta Llama » retrouverait l'« Autre », que la
-- recherche par nom replié trouve avant les alias (tools/resolve.ts). Tous les alias, pas seulement
-- les neufs : la migration se rejoue sur n'importe quelle base.
DO $c17$
DECLARE
  o record;
BEGIN
  FOR o IN
    SELECT x."id" AS from_id, a."tool_id" AS into_id
    FROM "tool" x
    JOIN "tool_alias" a ON a."folded" = x."folded"
    JOIN "tool" c ON c."id" = a."tool_id" AND c."status" = 'catalogue'
    WHERE x."status" <> 'catalogue'
    ORDER BY x."folded"
  LOOP
    PERFORM pg_temp.c17_merge(o.from_id, o.into_id);
  END LOOP;
END
$c17$;
--> statement-breakpoint
-- Un alias égal au nom d'un outil ne sert plus à rien (le nom suffit, sec-A3) : celui qu'un
-- rattachement vers un outil renommé aurait laissé.
DELETE FROM "tool_alias" a USING "tool" t WHERE t."folded" = a."folded";
--> statement-breakpoint
-- On range.
DROP TABLE c17_tool;
--> statement-breakpoint
DROP FUNCTION pg_temp.c17_merge(uuid, uuid);
--> statement-breakpoint
DROP FUNCTION pg_temp.c17_free_slug(text, uuid);
